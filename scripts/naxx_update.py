#!/usr/bin/env python3
"""Atualizador dos arquivos próprios Xui Naxx. Não executa código do pacote."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import socketserver
import stat
import struct
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
import zipfile

REPOSITORY = 'victorbrum33/Xui-Naxx-Updates'
MAX_ARCHIVE = 25 * 1024 * 1024
MAX_EXPANDED = 60 * 1024 * 1024
MAX_FILE = 12 * 1024 * 1024
MAX_MANIFEST = 128 * 1024
RUNTIME = Path('/var/lib/naxx-updates')
SOCKET = Path('/run/naxx-update/control.sock')
ALLOWED_FILES = frozenset({
    'admin/assets/js/naxx-overlay.js',
    'admin/assets/js/naxx-native-importer.js',
    'admin/assets/js/naxx-importer.js',
    'admin/assets/js/naxx-importer-ui.js',
    'admin/assets/js/naxx-importer-worker.js',
    'admin/assets/js/naxx-update-ui.js',
    'admin/assets/css/naxx-overlay.css',
    'admin/assets/css/naxx-overlay.light.css',
    'admin/assets/css/naxx-importer.css',
    'admin/assets/css/naxx-update.css',
    'admin/assets/images/naxx-mark.svg',
    'admin/assets/images/naxx-favicon.svg',
    'admin/naxx-importador.html',
    'admin/naxx-importador.php',
    'admin/naxx-import-url.php',
    'admin/naxx-epg-sync.php',
    'admin/naxx-update.php',
    'admin/naxx-update-page.php',
    'includes/langs/pt_br.ini',
})


class UpdateError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def digest_bytes(data):
    return hashlib.sha256(data).hexdigest()


def strict_json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise UpdateError('O manifesto contém chaves repetidas.')
            result[key] = value
        return result
    try:
        return json.loads(data, object_pairs_hook=unique)
    except (ValueError, UnicodeError) as error:
        raise UpdateError('Não foi possível ler os dados da atualização.') from error


def atomic_json(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix='.naxx-', dir=str(path.parent))
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            json.dump(data, stream, ensure_ascii=False, separators=(',', ':'))
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, 0o600)
        os.replace(name, path)
        directory = os.open(str(path.parent), os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def load_json(path, default=None):
    if not path.exists():
        return default
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 1024 * 1024:
        raise UpdateError('O estado local da atualização é inválido.', 503)
    return strict_json(path.read_bytes())


def write_backup(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with path.open('xb') as stream:
        os.chmod(path, 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def allowed_url(url, kind):
    if not isinstance(url, str) or len(url) > 2048:
        raise UpdateError('A URL da atualização é inválida.')
    try:
        parts = urllib.parse.urlsplit(url)
        valid_port = parts.port in (None, 443)
    except ValueError as error:
        raise UpdateError('A URL da atualização é inválida.') from error
    if parts.scheme != 'https' or parts.username or parts.password or not valid_port or parts.query or parts.fragment:
        raise UpdateError('A atualização exige uma URL HTTPS pública válida.')
    if kind == 'repository':
        valid = parts.hostname == 'api.github.com' and parts.path == '/repos/' + REPOSITORY
    elif kind == 'manifest':
        valid = parts.hostname == 'raw.githubusercontent.com' and parts.path == '/' + REPOSITORY + '/main/latest.json'
    else:
        valid = parts.hostname == 'raw.githubusercontent.com' and bool(re.fullmatch('/' + re.escape(REPOSITORY) + r'/[a-f0-9]{40}/naxx-frontend\.zip', parts.path))
    if not valid:
        raise UpdateError('A atualização aponta para um endereço fora do canal permitido.')
    return url


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        raise UpdateError('O canal de atualização tentou redirecionar o download.')


def download(url, kind, limit):
    allowed_url(url, kind)
    request = urllib.request.Request(url, headers={'User-Agent': 'Xui-Naxx-Updater/1.0', 'Accept': 'application/json' if kind != 'archive' else 'application/octet-stream'})
    try:
        opener = urllib.request.build_opener(NoRedirect())
        with opener.open(request, timeout=15) as response:
            declared = response.headers.get('Content-Length')
            if declared and (not declared.isdigit() or int(declared) > limit):
                raise UpdateError('O download excede o tamanho permitido.')
            chunks, size = [], 0
            while True:
                chunk = response.read(min(65536, limit + 1 - size))
                if not chunk:
                    break
                size += len(chunk)
                if size > limit:
                    raise UpdateError('O download excede o tamanho permitido.')
                chunks.append(chunk)
            return b''.join(chunks)
    except UpdateError:
        raise
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise UpdateError('O canal público não está disponível. Tente novamente mais tarde.', 502) from error


def validate_manifest(value):
    if not isinstance(value, dict) or type(value.get('schema')) is not int or value['schema'] != 1:
        raise UpdateError('Formato de atualização não suportado.')
    if not re.fullmatch(r'\d{1,5}\.\d{1,5}\.\d{1,5}', str(value.get('version', ''))):
        raise UpdateError('A versão da atualização é inválida.')
    archive = value.get('archive')
    if not isinstance(archive, dict):
        raise UpdateError('O manifesto não informa o pacote da atualização.')
    allowed_url(archive.get('url'), 'archive')
    if not re.fullmatch(r'[a-f0-9]{64}', str(archive.get('sha256', ''))) or type(archive.get('size')) is not int or not 1 <= archive['size'] <= MAX_ARCHIVE:
        raise UpdateError('A identificação do pacote da atualização é inválida.')
    files = value.get('files')
    if not isinstance(files, list) or not 1 <= len(files) <= 40:
        raise UpdateError('A lista de arquivos da atualização é inválida.')
    seen, total = set(), 0
    for entry in files:
        if not isinstance(entry, dict) or entry.get('path') not in ALLOWED_FILES or entry['path'] in seen:
            raise UpdateError('O pacote tenta alterar arquivos fora das melhorias Xui Naxx.')
        if not re.fullmatch(r'[a-f0-9]{64}', str(entry.get('sha256', ''))) or type(entry.get('size')) is not int or not 0 <= entry['size'] <= MAX_FILE:
            raise UpdateError('A identificação de um arquivo da atualização é inválida.')
        total += entry['size']
        seen.add(entry['path'])
    if total > MAX_EXPANDED:
        raise UpdateError('O conteúdo da atualização excede o tamanho permitido.')
    return value


def version_key(value):
    return tuple(int(part) for part in value.split('.'))


class Manager:
    def __init__(self, runtime=RUNTIME):
        self.runtime = Path(runtime)
        self.config = load_json(self.runtime / 'config.json')
        if not isinstance(self.config, dict) or self.config.get('repository') != REPOSITORY:
            raise UpdateError('O serviço de atualização precisa ser instalado pelo administrador.', 503)
        self.root = Path(self.config['root'])
        if not self.root.is_absolute() or self.root.is_symlink() or not self.root.is_dir():
            raise UpdateError('A instalação local do painel é inválida.', 503)
        self.uid, self.gid = int(self.config['owner_uid']), int(self.config['owner_gid'])
        self.state_lock = threading.RLock()
        self.job_lock = threading.Lock()
        self.state = load_json(self.runtime / 'state.json', {})
        self.state['busy'] = False
        if self.state.get('status') in ('checking', 'installing', 'restoring'):
            self.state.update(status='error', error='A última atualização foi interrompida. Verifique o histórico antes de tentar novamente.')
        self.installed = load_json(self.runtime / 'installed.json', {'version': '1.5.14', 'files': {}, 'archive_sha256': None, 'last_backup': None})
        self.save_state()

    @contextlib.contextmanager
    def parent_fd(self, relative, create=False):
        if relative not in ALLOWED_FILES:
            raise UpdateError('Arquivo fora das melhorias Xui Naxx.')
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        descriptor = os.open(str(self.root), flags)
        try:
            parts = relative.split('/')
            for component in parts[:-1]:
                if create:
                    try:
                        os.mkdir(component, 0o755, dir_fd=descriptor)
                        os.chown(component, self.uid, self.gid, dir_fd=descriptor, follow_symlinks=False)
                    except FileExistsError:
                        pass
                child = os.open(component, flags, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = child
            yield descriptor, parts[-1]
        finally:
            os.close(descriptor)

    def read_target(self, relative):
        try:
            with self.parent_fd(relative) as (parent, name):
                descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
                with os.fdopen(descriptor, 'rb') as stream:
                    metadata = os.fstat(stream.fileno())
                    if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1 or metadata.st_size > MAX_FILE:
                        raise UpdateError('Um arquivo local tem tipo ou tamanho incompatível: ' + relative)
                    data = stream.read(MAX_FILE + 1)
                    if len(data) > MAX_FILE:
                        raise UpdateError('Um arquivo local excede o tamanho permitido: ' + relative)
                    return data, metadata
        except FileNotFoundError:
            return None, None
        except OSError as error:
            raise UpdateError('Não foi possível verificar um arquivo local com segurança: ' + relative) from error

    def replace_target(self, relative, data, mode=0o644, uid=None, gid=None):
        with self.parent_fd(relative, create=True) as (parent, name):
            temporary = '.naxx-update-' + os.urandom(12).hex()
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
            try:
                with os.fdopen(descriptor, 'wb') as stream:
                    stream.write(data)
                    stream.flush()
                    os.fsync(stream.fileno())
                    os.fchmod(stream.fileno(), mode & 0o666)
                    os.fchown(stream.fileno(), self.uid if uid is None else uid, self.gid if gid is None else gid)
                os.replace(temporary, name, src_dir_fd=parent, dst_dir_fd=parent)
                os.fsync(parent)
            finally:
                with contextlib.suppress(FileNotFoundError):
                    os.unlink(temporary, dir_fd=parent)

    def remove_target(self, relative):
        with self.parent_fd(relative) as (parent, name):
            os.unlink(name, dir_fd=parent)
            os.fsync(parent)

    def save_state(self):
        with self.state_lock:
            self.state.update(installed=self.installed['version'], automatic=bool(self.config.get('automatic')), repository=REPOSITORY, canRollback=bool(self.installed.get('last_backup')))
            self.state.setdefault('available', None)
            self.state.setdefault('checkedAt', None)
            self.state.setdefault('status', 'idle')
            self.state.setdefault('error', None)
            self.state.setdefault('history', [])
            atomic_json(self.runtime / 'state.json', self.state)

    def snapshot(self):
        with self.state_lock:
            return json.loads(json.dumps(self.state))

    def change_state(self, **values):
        with self.state_lock:
            self.state.update(values)
            self.save_state()

    def latest(self):
        repository = strict_json(download('https://api.github.com/repos/' + REPOSITORY, 'repository', MAX_MANIFEST))
        if not isinstance(repository, dict) or repository.get('private') is not False or str(repository.get('full_name', '')).lower() != REPOSITORY.lower():
            raise UpdateError('O canal de atualização precisa ser um repositório público permitido.')
        manifest = validate_manifest(strict_json(download('https://raw.githubusercontent.com/' + REPOSITORY + '/main/latest.json', 'manifest', MAX_MANIFEST)))
        if version_key(manifest['version']) < version_key(self.installed['version']):
            raise UpdateError('O canal oferece uma versão anterior à instalada. Atualização interrompida.')
        changed = manifest['archive']['sha256'] != self.installed.get('archive_sha256')
        atomic_json(self.runtime / 'candidate.json', manifest)
        self.change_state(available=manifest['version'] if changed else None, checkedAt=now(), status='available' if changed else 'up_to_date', error=None)
        return manifest, changed

    def unpack(self, manifest, archive, stage):
        if len(archive) != manifest['archive']['size'] or digest_bytes(archive) != manifest['archive']['sha256']:
            raise UpdateError('O pacote baixado não corresponde ao SHA256 publicado.')
        archive_path = stage / 'package.zip'
        archive_path.write_bytes(archive)
        expected = {'payload/' + entry['path']: entry for entry in manifest['files']}
        try:
            with zipfile.ZipFile(archive_path) as package:
                members = package.infolist()
                if len(members) != len(expected) or len({member.filename for member in members}) != len(members):
                    raise UpdateError('O ZIP contém entradas extras ou repetidas.')
                for member in members:
                    entry = expected.get(member.filename)
                    kind = stat.S_IFMT(member.external_attr >> 16)
                    if not entry or member.is_dir() or member.flag_bits & 1 or kind not in (0, stat.S_IFREG) or member.file_size != entry['size']:
                        raise UpdateError('O ZIP contém um caminho ou tipo de arquivo não permitido.')
                    target = stage / entry['path']
                    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    with package.open(member) as source, target.open('wb') as output:
                        checksum, size = hashlib.sha256(), 0
                        while True:
                            chunk = source.read(65536)
                            if not chunk:
                                break
                            size += len(chunk)
                            if size > entry['size']:
                                raise UpdateError('Um arquivo expandido excedeu o tamanho publicado.')
                            checksum.update(chunk)
                            output.write(chunk)
                    if size != entry['size'] or checksum.hexdigest() != entry['sha256']:
                        raise UpdateError('Um arquivo do pacote não corresponde ao SHA256 publicado.')
        except (zipfile.BadZipFile, RuntimeError, EOFError) as error:
            raise UpdateError('O pacote ZIP da atualização está inválido.') from error

    def restore_record(self, backup, record, before=True):
        prefix = 'before' if before else 'after'
        if before and not record['existed']:
            self.remove_target(record['path'])
        else:
            data = (backup / prefix / record['path']).read_bytes()
            expected = record['before_sha256'] if before else record['after_sha256']
            if digest_bytes(data) != expected:
                raise UpdateError('O backup da atualização está corrompido.')
            self.replace_target(record['path'], data, record['mode'], record['uid'], record['gid'])

    def install(self):
        manifest, changed = self.latest()
        if not changed:
            return
        self.change_state(status='installing')
        expanded = sum(entry['size'] for entry in manifest['files'])
        if shutil.disk_usage(self.runtime).free < expanded * 3 + MAX_ARCHIVE + 32 * 1024 * 1024:
            raise UpdateError('Não há espaço livre suficiente para atualizar com backup.')
        archive = download(manifest['archive']['url'], 'archive', manifest['archive']['size'])
        with tempfile.TemporaryDirectory(prefix='stage-', dir=str(self.runtime)) as stage_name:
            stage = Path(stage_name)
            self.unpack(manifest, archive, stage)
            del archive
            records = []
            for entry in manifest['files']:
                data, metadata = self.read_target(entry['path'])
                current = digest_bytes(data) if data is not None else None
                known = self.installed.get('files', {}).get(entry['path'])
                if current == entry['sha256']:
                    continue
                if current != known and not (known is None and current is None):
                    raise UpdateError('Um arquivo foi alterado localmente. Atualização interrompida: ' + entry['path'])
                records.append({'path': entry['path'], 'existed': data is not None, 'before_sha256': current, 'after_sha256': entry['sha256'], 'mode': stat.S_IMODE(metadata.st_mode) if metadata else 0o644, 'uid': metadata.st_uid if metadata else self.uid, 'gid': metadata.st_gid if metadata else self.gid})
            backup_id = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + os.urandom(6).hex()
            backup = self.runtime / 'backups' / backup_id
            backup.mkdir(mode=0o700, parents=True, exist_ok=False)
            for record in records:
                if record['existed']:
                    data, _ = self.read_target(record['path'])
                    if digest_bytes(data) != record['before_sha256']:
                        raise UpdateError('Um arquivo mudou durante a preparação do backup.')
                    target = backup / 'before' / record['path']
                    write_backup(target, data)
                after = backup / 'after' / record['path']
                write_backup(after, (stage / record['path']).read_bytes())
            previous = self.installed
            journal = {'schema': 1, 'root': str(self.root), 'createdAt': now(), 'previous': previous, 'version': manifest['version'], 'files': records}
            atomic_json(backup / 'backup.json', journal)
            applied = []
            try:
                for record in records:
                    current, _ = self.read_target(record['path'])
                    if (digest_bytes(current) if current is not None else None) != record['before_sha256']:
                        raise UpdateError('Um arquivo mudou durante a atualização. Alterações revertidas.')
                    self.restore_record(backup, record, before=False)
                    applied.append(record)
                self.installed = {'version': manifest['version'], 'archive_sha256': manifest['archive']['sha256'], 'revision': manifest['archive']['url'].split('/')[-2], 'installedAt': now(), 'last_backup': backup_id, 'files': {**previous.get('files', {}), **{entry['path']: entry['sha256'] for entry in manifest['files']}}}
                atomic_json(self.runtime / 'installed.json', self.installed)
            except Exception:
                for record in reversed(applied):
                    self.restore_record(backup, record)
                self.installed = previous
                raise
            history = [{'version': manifest['version'], 'installedAt': self.installed['installedAt'], 'backup': backup_id, 'operation': 'install'}] + self.state.get('history', [])
            self.change_state(status='up_to_date', available=None, error=None, history=history[:10])
            with contextlib.suppress(OSError):
                self.prune_backups()

    def prune_backups(self):
        # Limita o espaço ocupado pelas cópias sem tocar em pastas do painel.
        backups = self.runtime / 'backups'
        entries = sorted((path for path in backups.iterdir() if re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}', path.name) and path.is_dir() and not path.is_symlink()), reverse=True)
        for path in entries[5:]:
            shutil.rmtree(path)

    def rollback(self):
        backup_id = self.installed.get('last_backup')
        if not isinstance(backup_id, str) or not re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}', backup_id):
            raise UpdateError('Não há uma versão anterior disponível para restaurar.', 409)
        backup = self.runtime / 'backups' / backup_id
        journal = load_json(backup / 'backup.json')
        if not isinstance(journal, dict) or journal.get('root') != str(self.root):
            raise UpdateError('O backup pertence a outra instalação.')
        records = journal['files']
        for record in records:
            current, _ = self.read_target(record['path'])
            if current is None or digest_bytes(current) != record['after_sha256']:
                raise UpdateError('Um arquivo mudou depois da atualização. Restauração interrompida.')
            if record['existed'] and digest_bytes((backup / 'before' / record['path']).read_bytes()) != record['before_sha256']:
                raise UpdateError('O backup da versão anterior está corrompido.')
        applied = []
        try:
            for record in reversed(records):
                self.restore_record(backup, record)
                applied.append(record)
            self.installed = journal['previous']
            atomic_json(self.runtime / 'installed.json', self.installed)
        except Exception:
            for record in reversed(applied):
                self.restore_record(backup, record, before=False)
            raise
        self.config['automatic'] = False
        atomic_json(self.runtime / 'config.json', self.config)
        history = [{'version': self.installed['version'], 'installedAt': now(), 'backup': backup_id, 'operation': 'rollback'}] + self.state.get('history', [])
        self.change_state(status='idle', available=None, error=None, history=history[:10])

    def schedule(self, action):
        if not self.job_lock.acquire(blocking=False):
            raise UpdateError('Já existe uma atualização em andamento.', 409)
        try:
            self.change_state(busy=True, status={'check': 'checking', 'install': 'installing', 'rollback': 'restoring'}[action], error=None)
        except Exception:
            self.job_lock.release()
            raise
        def run():
            try:
                {'check': self.latest, 'install': self.install, 'rollback': self.rollback}[action]()
            except Exception as error:
                message = str(error) if isinstance(error, UpdateError) else 'Não foi possível concluir a atualização. O painel foi preservado; consulte o serviço local.'
                self.change_state(status='error', error=message)
            finally:
                self.change_state(busy=False)
                self.job_lock.release()
        threading.Thread(target=run, daemon=True, name='naxx-update-job').start()
        return {'ok': True, 'state': self.snapshot()}

    def dispatch(self, request, uid):
        action = request.get('action')
        if action == 'status':
            return {'ok': True, 'state': self.snapshot()}
        if action == 'automatic':
            if type(request.get('enabled')) is not bool:
                raise UpdateError('Informe se as atualizações automáticas devem ser ativadas.')
            with self.state_lock:
                self.config['automatic'] = request['enabled']
                atomic_json(self.runtime / 'config.json', self.config)
                self.save_state()
            return {'ok': True, 'state': self.snapshot()}
        if action == 'auto':
            if uid != 0:
                raise UpdateError('A rotina automática exige o serviço local.', 403)
            if not self.config.get('automatic'):
                return {'ok': True, 'state': self.snapshot()}
            action = 'install'
        if action not in ('check', 'install', 'rollback'):
            raise UpdateError('Ação de atualização inválida.')
        return self.schedule(action)


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(3)
        try:
            uid = struct.unpack('3i', self.request.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize('3i')))[1]
            if uid not in (0, self.server.manager.uid):
                raise UpdateError('Acesso ao serviço de atualização negado.', 403)
            raw = self.rfile.readline(4097)
            if len(raw) > 4096 or not raw.endswith(b'\n'):
                raise UpdateError('Solicitação de atualização inválida.')
            request = strict_json(raw)
            if not isinstance(request, dict):
                raise UpdateError('Solicitação de atualização inválida.')
            result = self.server.manager.dispatch(request, uid)
        except Exception as error:
            result = {'ok': False, 'message': str(error) if isinstance(error, UpdateError) else 'O serviço de atualização encontrou uma falha.', 'status': getattr(error, 'status', 500)}
        self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8') + b'\n')


class Server(socketserver.ThreadingUnixStreamServer):
    daemon_threads = True
    allow_reuse_address = False


def initialize(runtime, root, owner, automatic=False):
    if os.geteuid() != 0:
        raise UpdateError('Execute a instalação do atualizador como root.')
    account = pwd.getpwnam(owner)
    root = Path(root).absolute()
    if root.is_symlink() or not root.is_dir():
        raise UpdateError('A pasta de instalação do painel é inválida.')
    runtime.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(runtime, 0o700)
    if (runtime / 'config.json').exists():
        raise UpdateError('O atualizador já está configurado; a configuração existente foi preservada.')
    config = {'root': str(root), 'owner_uid': account.pw_uid, 'owner_gid': account.pw_gid, 'repository': REPOSITORY, 'automatic': bool(automatic)}
    atomic_json(runtime / 'config.json', config)
    manager = Manager(runtime)
    files = {}
    for path in ALLOWED_FILES:
        data, _ = manager.read_target(path)
        if data is not None:
            files[path] = digest_bytes(data)
    manager.installed['files'] = files
    atomic_json(runtime / 'installed.json', manager.installed)
    manager.save_state()
    print('Serviço Xui Naxx configurado. Nenhum arquivo do painel foi alterado.')


def client(path, action):
    with socket.socket(socket.AF_UNIX) as connection:
        connection.settimeout(5)
        connection.connect(str(path))
        connection.sendall(json.dumps({'action': action}).encode('ascii') + b'\n')
        with connection.makefile('rb') as stream:
            result = strict_json(stream.readline(65537))
    if not result.get('ok'):
        raise UpdateError(result.get('message', 'O serviço de atualização falhou.'))
    print(json.dumps(result, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--initialize', action='store_true')
    mode.add_argument('--daemon', action='store_true')
    mode.add_argument('--automatic', action='store_true')
    mode.add_argument('--status', action='store_true')
    parser.add_argument('--root', default='/home/xui')
    parser.add_argument('--owner', default='xui')
    parser.add_argument('--runtime', type=Path, default=RUNTIME)
    parser.add_argument('--socket', type=Path, default=SOCKET)
    parser.add_argument('--enable-automatic', action='store_true')
    args = parser.parse_args()
    if args.initialize:
        initialize(args.runtime, args.root, args.owner, args.enable_automatic)
    elif args.daemon:
        if os.geteuid() != 0:
            raise UpdateError('O serviço precisa ser iniciado como root.')
        manager = Manager(args.runtime)
        lock = (args.runtime / 'service.lock').open('a')
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise UpdateError('O serviço de atualização já está em execução.') from error
        args.socket.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
        os.chown(args.socket.parent, 0, manager.gid)
        os.chmod(args.socket.parent, 0o750)
        if args.socket.exists() or args.socket.is_symlink():
            metadata = args.socket.lstat()
            if not stat.S_ISSOCK(metadata.st_mode) or metadata.st_uid != 0:
                raise UpdateError('O caminho do socket local está ocupado.')
            args.socket.unlink()
        with Server(str(args.socket), Handler) as server:
            server.manager = manager
            os.chown(args.socket, 0, manager.gid)
            os.chmod(args.socket, 0o660)
            server.serve_forever(poll_interval=0.5)
    else:
        client(args.socket, 'auto' if args.automatic else 'status')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit('Erro: ' + str(error))
