#!/usr/bin/env python3
"""Comprime a interface do Naxx com validação, backup e recarga gradual do nginx."""
import argparse
import datetime
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time

ROOT = Path('/home/xui')
BACKUPS = Path('/var/lib/naxx-performance/http-backups')
MANAGED = '''# Xui Naxx: compressao da interface; video e transporte binario ficam fora dos tipos.
gzip on;
gzip_comp_level 2;
gzip_min_length 1024;
gzip_vary on;
gzip_types text/css application/javascript text/javascript application/json image/svg+xml;
'''


def digest(data):
    return hashlib.sha256(data).hexdigest()


def checked_file(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 1024 * 1024:
        raise RuntimeError('Arquivo HTTP ausente, simbólico ou incompatível: ' + str(path))
    return path.read_bytes()


def write(path, data, mode, uid, gid):
    descriptor, temporary = tempfile.mkstemp(prefix='.naxx-http-', dir=str(path.parent))
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        os.chown(temporary, uid, gid)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def validate():
    result = subprocess.run([str(ROOT / 'bin/nginx/sbin/nginx'), '-t', '-c', str(ROOT / 'bin/nginx/conf/nginx.conf')], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError('A configuração nginx não passou na validação. Os arquivos foram preservados/restaurados.')


def master():
    executable = (ROOT / 'bin/nginx/sbin/nginx').resolve()
    matches = []
    for directory in Path('/proc').iterdir():
        if not directory.name.isdigit():
            continue
        try:
            if (directory / 'exe').resolve() == executable and (directory / 'cmdline').read_bytes().startswith(b'nginx: master process '):
                matches.append(int(directory.name))
        except (OSError, RuntimeError):
            pass
    if len(matches) != 1:
        raise RuntimeError('Não foi encontrado um único processo mestre nginx da instalação.')
    return matches[0]


def healthy():
    try:
        connection = http.client.HTTPConnection('127.0.0.1', 80, timeout=2)
        connection.request('HEAD', '/')
        status = connection.getresponse().status
        connection.close()
        return status < 500
    except OSError:
        return False


def reload(pid):
    if master() != pid:
        raise RuntimeError('O processo nginx mudou durante a aplicação.')
    os.kill(pid, signal.SIGHUP)
    for _ in range(20):
        time.sleep(.25)
        if healthy():
            return
    raise RuntimeError('O nginx não respondeu à verificação após a recarga.')


def apply():
    target = ROOT / 'bin/nginx/conf/gzip.conf'
    old = checked_file(target)
    if old == MANAGED.encode():
        validate()
        return {'status': 'unchanged', 'compression': 'gzip level 2'}
    active = '\n'.join(line.split('#', 1)[0].strip() for line in old.decode().splitlines()).strip()
    if not re.fullmatch(r'gzip\s+off\s*;', active):
        validate()
        return {'status': 'preserved', 'message': 'Configuração HTTP personalizada preservada.'}
    validate()
    pid = master()
    if not healthy():
        raise RuntimeError('A porta HTTP padrão não está respondendo; nenhuma configuração foi alterada.')
    metadata = target.stat()
    backup_id = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = BACKUPS / backup_id
    backup.mkdir(mode=0o700, parents=True)
    (backup / 'before.conf').write_bytes(old)
    os.chmod(backup / 'before.conf', 0o600)
    record = {'root': str(ROOT), 'before': digest(old), 'after': digest(MANAGED.encode()), 'mode': metadata.st_mode & 0o777, 'uid': metadata.st_uid, 'gid': metadata.st_gid}
    (backup / 'manifest.json').write_text(json.dumps(record))
    os.chmod(backup / 'manifest.json', 0o600)
    try:
        write(target, MANAGED.encode(), record['mode'], record['uid'], record['gid'])
        validate()
        reload(pid)
    except Exception:
        write(target, old, record['mode'], record['uid'], record['gid'])
        validate()
        reload(pid)
        raise
    return {'status': 'applied', 'backup': str(backup), 'compression': 'gzip level 2'}


def restore(backup_id):
    if not re.fullmatch(r'\d{8}T\d{12}Z', backup_id):
        raise RuntimeError('Informe apenas o identificador do backup HTTP.')
    backup = BACKUPS / backup_id
    record = json.loads(checked_file(backup / 'manifest.json'))
    old = checked_file(backup / 'before.conf')
    target = ROOT / 'bin/nginx/conf/gzip.conf'
    current = checked_file(target)
    if record['root'] != str(ROOT) or digest(old) != record['before'] or digest(current) != record['after']:
        raise RuntimeError('O backup não confere ou a configuração foi alterada depois da aplicação.')
    validate()
    pid = master()
    try:
        write(target, old, record['mode'], record['uid'], record['gid'])
        validate()
        reload(pid)
    except Exception:
        write(target, current, record['mode'], record['uid'], record['gid'])
        validate()
        reload(pid)
        raise
    return {'status': 'restored', 'backup': str(backup)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--check', action='store_true', help='Conferir configuração sem alterar arquivos')
    group.add_argument('--apply', action='store_true', help='Aplicar compressão com backup e validação')
    group.add_argument('--restore', metavar='ID', help='Restaurar o backup HTTP indicado')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Execute com sudo.')
    if args.apply:
        result = apply()
    elif args.restore:
        result = restore(args.restore)
    else:
        target = ROOT / 'bin/nginx/conf/gzip.conf'
        value = checked_file(target).decode()
        validate()
        result = {'status': 'checked', 'managed': value == MANAGED, 'gzip_enabled': bool(re.search(r'^\s*gzip\s+on\s*;', value, re.M)), 'planned': 'gzip level 2 para HTML/CSS/JavaScript/JSON/SVG', 'changed': False}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit('Erro: ' + str(error))
