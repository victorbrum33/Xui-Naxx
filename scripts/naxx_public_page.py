#!/usr/bin/env python3
"""Publish only the bundled public HTML themes; never accept paths or HTML."""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import secrets
import stat
import threading

PUBLIC_INDEX = Path('/home/xui/www/index.html')
THEMES = Path('/usr/local/lib/naxx-public-page/themes')
RUNTIME = Path('/var/lib/naxx-public-page')
THEME_IDS = ('naxx', 'aurora', 'claro', 'cinema')
# Verified against both /home/xui/www/index.html and its HTTP/HTTPS response.
ORIGINAL_SHA256 = '7e7a385533472e280145222d510689dbf3d6664d3d2488c1daa545cba88ad39f'
MAX_HTML = 128 * 1024
_LOCK = threading.RLock()


class PublicPageError(Exception):
    def __init__(self, message, status=409):
        super().__init__(message)
        self.status = status


def digest(data):
    return hashlib.sha256(data).hexdigest()


def signature(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns,
            info.st_ctime_ns, info.st_uid, info.st_gid, info.st_mode)


@contextlib.contextmanager
def directory(path, trusted=False):
    """Anchor every operation to no-follow directory descriptors."""
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise PublicPageError('O diretório da página pública é inválido.')
    descriptor = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for component in path.parts[1:]:
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
            info = os.fstat(descriptor)
            # Root-owned sticky ancestors (e.g. /tmp in offline fixtures)
            # cannot rename another owner's private child directory.
            if info.st_mode & 0o022 and not (info.st_uid == 0 and info.st_mode & stat.S_ISVTX):
                raise PublicPageError('As permissões da página pública precisam ser verificadas.')
            if trusted and info.st_uid != 0:
                raise PublicPageError('Os modelos e backups devem pertencer ao serviço local.')
        yield descriptor
    finally:
        os.close(descriptor)


def read_file(descriptor, name, trusted=False, missing=False):
    try:
        handle = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=descriptor)
    except FileNotFoundError:
        if missing:
            return None, None
        raise
    with os.fdopen(handle, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > MAX_HTML:
            raise PublicPageError('O arquivo da página pública não é um HTML regular permitido.')
        if trusted and (info.st_uid != 0 or info.st_mode & 0o022):
            raise PublicPageError('Os modelos e backups devem pertencer ao serviço local.')
        data = stream.read(MAX_HTML + 1)
        if len(data) > MAX_HTML or signature(info) != signature(os.fstat(stream.fileno())):
            raise PublicPageError('A página foi alterada durante a leitura. Tente novamente.')
        return data, info


def unchanged(descriptor, name, expected):
    try:
        current = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
    except FileNotFoundError:
        return expected is None
    return expected is not None and signature(current) == signature(expected)


def replace_file(descriptor, name, data, mode, uid, gid, expected=None):
    temporary = '.naxx-public-' + secrets.token_hex(16)
    handle = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=descriptor)
    try:
        with os.fdopen(handle, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fchown(stream.fileno(), uid, gid)
            os.fchmod(stream.fileno(), mode)
            os.fsync(stream.fileno())
        if not unchanged(descriptor, name, expected):
            raise PublicPageError('A página foi alterada por outro processo e foi preservada.')
        os.replace(temporary, name, src_dir_fd=descriptor, dst_dir_fd=descriptor)
        os.fsync(descriptor)
    finally:
        try:
            os.unlink(temporary, dir_fd=descriptor)
        except FileNotFoundError:
            pass


class PublicPageStore:
    # Parameters are for offline fixtures only. Socket input never reaches these.
    def __init__(self, target=PUBLIC_INDEX, themes=THEMES, runtime=RUNTIME,
                 original_sha256=ORIGINAL_SHA256):
        self.target, self.themes, self.runtime = Path(target), Path(themes), Path(runtime)
        self.original_sha256 = original_sha256

    def templates(self):
        result = {}
        with directory(self.themes, trusted=True) as descriptor:
            for theme in THEME_IDS:
                data, _ = read_file(descriptor, theme + '.html', trusted=True, missing=True)
                if data is not None:
                    text = data.decode('utf-8')
                    if '<?' in text or '<html' not in text.lower() or '</html>' not in text.lower():
                        raise PublicPageError('Um modelo instalado não é um HTML estático válido.', 503)
                    result[theme] = data
        return result

    def backup(self):
        try:
            with directory(self.runtime, trusted=True) as descriptor:
                if os.fstat(descriptor).st_mode & 0o077:
                    raise PublicPageError('O backup da página pública deve ter acesso restrito.')
                data, _ = read_file(descriptor, 'original.html', trusted=True, missing=True)
                raw, info = read_file(descriptor, 'backup.json', trusted=True, missing=True)
        except FileNotFoundError:
            return None, None, None
        if data is None and raw is None:
            return None, None, None
        # A power loss between the two initial backup writes is recoverable
        # only while the target is still the verified original welcome page.
        if data is not None and raw is None and digest(data) == self.original_sha256:
            return data, None, None
        if data is None or raw is None:
            raise PublicPageError('O backup está incompleto; a página atual foi preservada.')
        metadata = json.loads(raw)
        if (not isinstance(metadata, dict) or digest(data) != self.original_sha256 or metadata.get('original_sha256') != self.original_sha256 or
                type(metadata.get('uid')) is not int or metadata['uid'] < 0 or
                type(metadata.get('gid')) is not int or metadata['gid'] < 0 or
                type(metadata.get('mode')) is not int or metadata['mode'] & ~0o777 or
                not isinstance(metadata.get('published'), dict) or
                any(len(key) != 64 or value not in THEME_IDS for key, value in metadata['published'].items())):
            raise PublicPageError('O backup não passou pela validação; a página atual foi preservada.')
        return data, metadata, info

    def inspect(self, descriptor, templates):
        for competitor in ('index.php', 'index.htm'):
            try:
                os.stat(competitor, dir_fd=descriptor, follow_symlinks=False)
            except FileNotFoundError:
                continue
            raise PublicPageError('Há outro índice na raiz pública; a publicação foi bloqueada.')
        data, info = read_file(descriptor, self.target.name)
        parent = os.fstat(descriptor)
        if (info.st_uid not in (0, parent.st_uid) or info.st_gid not in (0, parent.st_gid) or
                info.st_mode & 0o7022):
            raise PublicPageError('O proprietário ou as permissões da página pública não são os esperados.')
        original, metadata, backup_info = self.backup()
        current = digest(data)
        selected = 'original' if current == self.original_sha256 else (metadata or {}).get('published', {}).get(current, 'custom')
        reason = ''
        if selected == 'custom':
            reason = 'A raiz pública contém uma página personalizada. Ela foi preservada.'
        elif len(templates) != len(THEME_IDS):
            reason = 'Os quatro modelos precisam estar instalados no serviço local.'
        state = {'selected': selected, 'available': list(templates),
                 'can_publish': not reason, 'can_restore': metadata is not None and selected != 'custom',
                 'reason': reason}
        return state, data, info, original, metadata, backup_info

    def execute(self, action, theme=None):
        if action not in ('public_page_status', 'public_page_preview', 'public_page_publish', 'public_page_restore'):
            raise PublicPageError('Ação de página pública inválida.', 400)
        if action in ('public_page_preview', 'public_page_publish') and (type(theme) is not str or theme not in THEME_IDS):
            raise PublicPageError('Selecione um dos quatro modelos disponíveis.', 400)
        templates = self.templates()
        with directory(self.target.parent) as descriptor:
            state, current, info, original, metadata, backup_info = self.inspect(descriptor, templates)
            if action == 'public_page_status':
                return {'ok': True, 'state': state}
            if action == 'public_page_preview':
                if theme not in templates:
                    raise PublicPageError('O modelo ainda não está instalado no serviço local.', 503)
                return {'ok': True, 'state': state, 'preview': {'theme': theme, 'html': templates[theme].decode('utf-8')}}
            if not state['can_publish'] or (action == 'public_page_restore' and original is None):
                raise PublicPageError(state['reason'] or 'Ainda não existe um backup original para restaurar.')
            desired = original if action == 'public_page_restore' else templates[theme]
            if current == desired:
                return {'ok': True, 'state': state, 'changed': False}
            if metadata is None:
                # Fail closed if the initial page differs from the verified stock welcome.
                if digest(current) != self.original_sha256:
                    raise PublicPageError('A página pública existente foi preservada.')
                self.runtime.mkdir(mode=0o700, exist_ok=True)
                metadata = {'original_sha256': self.original_sha256, 'uid': info.st_uid,
                            'gid': info.st_gid, 'mode': stat.S_IMODE(info.st_mode), 'published': {}}
                with directory(self.runtime, trusted=True) as backup_fd:
                    if os.fstat(backup_fd).st_mode & 0o077:
                        raise PublicPageError('O backup da página pública deve ter acesso restrito.')
                    if original is None:
                        replace_file(backup_fd, 'original.html', current, 0o600, 0, 0)
            if action == 'public_page_publish':
                metadata['published'][digest(desired)] = theme
            # Register only a trusted bundled hash before replacement. A failed write
            # leaves the current HTML and original backup intact and can be retried.
            with directory(self.runtime, trusted=True) as backup_fd:
                encoded = json.dumps(metadata, sort_keys=True).encode('utf-8')
                replace_file(backup_fd, 'backup.json', encoded, 0o600, 0, 0, backup_info)
            replace_file(descriptor, self.target.name, desired, metadata['mode'], metadata['uid'], metadata['gid'], info)
            state, *_ = self.inspect(descriptor, templates)
            return {'ok': True, 'state': state, 'changed': True}


def control_public_page(action, request=None):
    request = request or {}
    if not isinstance(request, dict) or set(request) - {'action', 'theme'}:
        raise PublicPageError('A solicitação da página pública é inválida.', 400)
    try:
        with _LOCK:
            return PublicPageStore().execute(action, request.get('theme'))
    except PublicPageError:
        raise
    except (OSError, ValueError, TypeError, UnicodeError) as error:
        raise PublicPageError('Não foi possível validar a raiz pública e os modelos instalados. A página existente foi preservada.', 503) from error
