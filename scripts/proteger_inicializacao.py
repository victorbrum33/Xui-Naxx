#!/usr/bin/env python3
"""Protege o fstab validado contra a rotina legada que pode esvaziá-lo."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess

TARGET = Path('/etc/fstab')
BACKUPS = Path('/var/backups/xui-naxx/boot')


def command(*args):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15).stdout.strip()


def inspect():
    if TARGET.is_symlink() or not TARGET.is_file() or TARGET.stat().st_uid != 0 or TARGET.stat().st_size > 1024 * 1024:
        raise RuntimeError('O arquivo de montagem precisa ser regular e pertencer ao administrador do sistema.')
    content = TARGET.read_bytes()
    roots = [row.split() for row in content.decode().splitlines() if row.strip() and not row.lstrip().startswith('#') and len(row.split()) > 1 and row.split()[1] == '/']
    if len(roots) != 1:
        raise RuntimeError('A entrada da montagem raiz está ausente ou duplicada. Restaure o fstab antes de continuar.')
    configured = command('findmnt', '--fstab', '--evaluate', '--tab-file', str(TARGET), '-n', '-o', 'SOURCE', '/')
    mounted = command('findmnt', '-n', '-o', 'SOURCE', '/')
    if Path(configured.split('[')[0]).resolve() != Path(mounted.split('[')[0]).resolve():
        raise RuntimeError('A montagem raiz do fstab difere do disco em uso. Confira a configuração antes de protegê-la.')
    flags = command('lsattr', '-d', str(TARGET)).split()[0]
    return content, 'i' in flags


def apply():
    content, protected = inspect()
    if protected:
        return {'ok': True, 'status': 'unchanged', 'protected': True}
    BACKUPS.mkdir(parents=True, exist_ok=True, mode=0o700)
    BACKUPS.chmod(0o700)
    folder = BACKUPS / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    folder.mkdir(mode=0o700)
    original = folder / 'fstab'
    descriptor = os.open(str(original), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    if TARGET.read_bytes() != content:
        raise RuntimeError('O arquivo de montagem mudou durante a preparação. Execute novamente.')
    command('chattr', '+i', str(TARGET))
    if inspect()[1] is not True:
        raise RuntimeError('Não foi possível confirmar a proteção do arquivo de montagem.')
    manifest = folder / 'manifest.json'
    manifest.write_text(json.dumps({'file': str(TARGET), 'sha256': hashlib.sha256(content).hexdigest(), 'protected': True}))
    manifest.chmod(0o600)
    return {'ok': True, 'status': 'applied', 'protected': True, 'backup': str(folder)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--check', action='store_true', help='Validar e informar a proteção sem alterar o arquivo')
    modes.add_argument('--apply', action='store_true', help='Salvar backup e proteger o arquivo validado')
    modes.add_argument('--unprotect', action='store_true', help='Liberar o arquivo para editar as montagens manualmente')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Execute com sudo.')
    if not args.apply and not args.unprotect:
        result = {'ok': True, 'status': 'checked', 'protected': inspect()[1], 'changed': False}
    else:
        descriptor = os.open('/run/naxx-boot-protection.lock', os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        with os.fdopen(descriptor, 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if args.apply:
                result = apply()
            else:
                command('chattr', '-i', str(TARGET))
                result = {'ok': True, 'status': 'unprotected', 'protected': False}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error) if isinstance(error, RuntimeError) else 'A proteção da inicialização não foi concluída. Confira o arquivo de montagem e as ferramentas do sistema.')
