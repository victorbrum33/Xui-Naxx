#!/usr/bin/env python3
"""Compatibilidade entre o IP local do painel e o Redis protegido em loopback."""
import argparse
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import tempfile

HELPER = Path('/usr/local/lib/naxx/redis_local.py')
UNIT = Path('/etc/systemd/system/naxx-redis-local.service')
UNIT_TEXT = '''# Gerenciado pelo Xui Naxx: compatibilidade Redis local
[Unit]
Description=Compatibilidade local de conexões Redis do Xui Naxx
After=local-fs.target
Before=xuione.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/python3 /usr/local/lib/naxx/redis_local.py --apply
ExecStop=/usr/bin/python3 /usr/local/lib/naxx/redis_local.py --remove
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=read-only
ProtectSystem=strict
ReadWritePaths=/run
RestrictAddressFamilies=AF_INET AF_UNIX AF_NETLINK

[Install]
WantedBy=multi-user.target
'''


def configuration():
    path = Path('/home/xui/bin/redis/redis.conf')
    if path.is_symlink() or not path.is_file():
        raise RuntimeError('Configuração Redis da instalação não encontrada.')
    text = path.read_text()
    port = re.search(r'^\s*port\s+(\d+)\s*$', text, re.M)
    if port and port[1] != '6379':
        raise RuntimeError('O perfil local exige a porta padrão 6379 do painel.')
    bind = re.search(r'^\s*bind\s+([^#\r\n]+)', text, re.M)
    local = bool(bind) and set(bind[1].split()).issubset({'127.0.0.1', '::1'})
    authentication = bool(re.search(r'^\s*requirepass\s+\S+', text, re.M))
    if not authentication:
        raise RuntimeError('O Redis precisa manter a autenticação configurada antes desta correção.')
    return local


def rule():
    uid = pwd.getpwnam('xui').pw_uid
    return ['-p', 'tcp', '--dport', '6379', '-m', 'addrtype', '--dst-type', 'LOCAL', '-m', 'owner', '--uid-owner', str(uid), '-m', 'comment', '--comment', 'naxx-redis-local', '-j', 'REDIRECT', '--to-ports', '6379']


def table(action):
    binary = shutil.which('iptables')
    if not binary:
        raise RuntimeError('iptables não está disponível neste servidor.')
    result = subprocess.run([binary, '-w', '5', '-t', 'nat', action, 'OUTPUT'] + (['1'] if action == '-I' else []) + rule(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
    if result.returncode not in (0, 1) or (action != '-C' and result.returncode != 0):
        raise RuntimeError('Não foi possível consultar ou aplicar a compatibilidade de rede local do Redis.')
    return result.returncode == 0


def apply():
    if not configuration():
        return {'ok': True, 'status': 'preserved', 'message': 'O Redis tem uma configuração de interfaces personalizada.'}
    if table('-C'):
        return {'ok': True, 'status': 'unchanged'}
    table('-I')
    return {'ok': True, 'status': 'applied', 'scope': 'IPv4 local, usuário xui, porta 6379'}


def remove():
    removed = 0
    while table('-C'):
        table('-D')
        removed += 1
    return {'ok': True, 'status': 'removed', 'rules': removed}


def write(path, content):
    if path.is_symlink():
        raise RuntimeError('Caminho simbólico recusado na instalação da compatibilidade Redis.')
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='.naxx-redis-', dir=str(path.parent))
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def install():
    configuration()
    for target, marker in ((HELPER, b'Compatibilidade entre o IP local do painel'), (UNIT, b'Gerenciado pelo Xui Naxx')):
        if target.is_symlink() or (target.exists() and marker not in target.read_bytes()):
            raise RuntimeError('Já existe um arquivo personalizado no destino da compatibilidade Redis.')
    source = Path(__file__).read_bytes()
    write(HELPER, source)
    write(UNIT, UNIT_TEXT.encode())
    subprocess.run(['systemd-analyze', 'verify', str(UNIT)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
    result = apply()
    subprocess.run(['systemctl', 'daemon-reload'], check=True, timeout=15)
    subprocess.run(['systemctl', 'enable', '--now', UNIT.name], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    result['service'] = UNIT.name
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--check', action='store_true')
    group.add_argument('--apply', action='store_true')
    group.add_argument('--install', action='store_true')
    group.add_argument('--remove', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Execute com sudo.')
    if args.install:
        result = install()
    elif args.apply:
        result = apply()
    elif args.remove:
        result = remove()
    else:
        result = {'ok': True, 'status': 'checked', 'loopback_only': configuration(), 'rule_present': table('-C'), 'changed': False}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, KeyError):
        raise SystemExit('Não foi possível concluir a compatibilidade Redis. Confira a configuração e o serviço local.')
