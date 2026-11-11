#!/usr/bin/env python3
# NAXX_MYSQL_SYNC_MANAGED_V1
"""Confere e concede as permissões de catálogo exigidas pelo Naxx Sync."""

import argparse
from contextlib import contextmanager
import ipaddress
import os
from pathlib import Path
import re
import shlex
import shutil
import socket
import stat
import subprocess
import sys
import tempfile


DATABASE = 'xui'
MARKER = '# NAXX_MYSQL_SYNC_MANAGED_V1'
CHAIN = 'NAXX_MYSQL_SYNC'
FIREWALL_SERVICE = 'naxx-mysql-sync-firewall.service'
REMOTE_SCRIPT = Path('/usr/local/lib/naxx-sync/configurar_mysql_sync.py')
REMOTE_CONFIG = Path('/etc/mysql/mariadb.conf.d/zz-naxx-sync.cnf')
REMOTE_UNIT = Path('/etc/systemd/system') / FIREWALL_SERVICE
REMOTE_DROPIN = Path('/etc/systemd/system/mariadb.service.d/naxx-sync.conf')
JUMP = '-p tcp -m tcp --dport 3306 -m comment --comment naxx-sync-managed -j ' + CHAIN
READ = ('SELECT',)
INSERT = (*READ, 'INSERT')
UPSERT = (*INSERT, 'UPDATE')
REBUILD = (*UPSERT, 'DELETE')
TABLE_PRIVILEGES = {
    'streams': REBUILD,
    'streams_series': REBUILD,
    'streams_categories': REBUILD,
    'streams_servers': (*INSERT, 'DELETE'),
    'streams_episodes': (*INSERT, 'DELETE'),
    'epg_channels': (*INSERT, 'DELETE'),
    'epg_data': (*INSERT, 'DELETE'),
    'bouquets': UPSERT,
    'epg': UPSERT,
}


def username(value):
    if not re.fullmatch(r'[a-zA-Z0-9_]{1,32}', value) or value.lower() == 'root':
        raise argparse.ArgumentTypeError('Use uma conta dedicada com até 32 letras, números ou sublinhados.')
    return value


def account_host(value):
    if value in ('%', 'localhost'):
        return value
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        raise argparse.ArgumentTypeError('Informe um IP, localhost ou %.') from None
    if '%' in value:
        raise argparse.ArgumentTypeError('Informe o endereço sem sufixo de interface.')
    return str(address)


def client_ip(value):
    try:
        address = ipaddress.IPv4Address(value)
    except ipaddress.AddressValueError:
        raise argparse.ArgumentTypeError('Informe o IPv4 individual do computador do Sync, sem máscara.') from None
    if address.is_unspecified or address.is_multicast or address.is_loopback or address.is_link_local:
        raise argparse.ArgumentTypeError('Informe o IPv4 remoto do computador do Sync.')
    return str(address)


def command(args, *, input=None, check=True):
    result = subprocess.run(args, input=input, encoding='utf-8', capture_output=True,
                            check=False, timeout=90)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or 'Falha no comando: ' + args[0])
    return result


def firewall_state():
    """Read only our chain and its INPUT references; never snapshot/replace NAT."""
    lines = command(['iptables-save', '-t', 'filter']).stdout.splitlines()
    chain = any(line.startswith(':' + CHAIN + ' ') for line in lines)
    rules, jumps, input_position = [], [], 0
    for line in lines:
        if not line.startswith('-A '):
            continue
        tokens = shlex.split(line)
        if tokens[1] == CHAIN:
            rules.append(line)
        if tokens[1] == 'INPUT':
            input_position += 1
        if any(tokens[index:index + 2] in (['-j', CHAIN], ['-g', CHAIN])
               for index in range(len(tokens) - 1)):
            if tokens[1] != 'INPUT' or tokens[2:] != shlex.split(JUMP):
                raise RuntimeError('A chain reservada do Sync possui uma referência não gerenciada.')
            jumps.append((input_position, ' '.join(tokens[2:])))
    if chain and not jumps:
        raise RuntimeError('A chain reservada do Sync já existe sem identificação gerenciada.')
    if len(jumps) > 1 or bool(jumps) != chain:
        raise RuntimeError('Estado da chain do Sync inconsistente; nenhuma regra foi alterada.')
    return {'exists': chain, 'rules': rules, 'jumps': jumps}


def firewall_transaction(previous, address=None, restore=None):
    lines = ['*filter']
    target_exists = restore['exists'] if restore is not None else True
    if target_exists:
        lines.append(':' + CHAIN + ' - [0:0]')
    for _, rule in previous['jumps']:
        lines.append('-D INPUT ' + rule)
    if restore is None:
        lines.extend(('-A ' + CHAIN + ' -i lo -j ACCEPT',
                      '-A ' + CHAIN + ' -s ' + address + '/32 -j ACCEPT',
                      '-A ' + CHAIN + ' -j DROP', '-I INPUT 1 ' + JUMP))
    elif restore['exists']:
        lines.extend(restore['rules'])
        lines.extend('-I INPUT ' + str(position) + ' ' + rule for position, rule in restore['jumps'])
    elif previous['exists']:
        lines.extend(('-F ' + CHAIN, '-X ' + CHAIN))
    return '\n'.join((*lines, 'COMMIT', ''))


def apply_firewall(address):
    before = firewall_state()
    transaction = firewall_transaction(before, address=address)
    # --noflush keeps every other chain, including INPUT rules and the NAT table.
    command(['iptables-restore', '--wait', '10', '--noflush', '--test'], input=transaction)
    command(['iptables-restore', '--wait', '10', '--noflush'], input=transaction)
    after = firewall_state()
    expected = ['-A ' + CHAIN + ' -i lo -j ACCEPT',
                '-A ' + CHAIN + ' -s ' + address + '/32 -j ACCEPT',
                '-A ' + CHAIN + ' -j DROP']
    if after['rules'] != expected or after['jumps'] != [(1, JUMP)]:
        raise RuntimeError('O firewall não confirmou a restrição da porta MySQL.')
    return before


def restore_firewall(before):
    current = firewall_state()
    transaction = firewall_transaction(current, restore=before)
    command(['iptables-restore', '--wait', '10', '--noflush'], input=transaction)


def read_owned(path):
    if path.is_symlink():
        raise RuntimeError('Arquivo gerenciado é um link simbólico: ' + str(path))
    if not path.exists():
        return None
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > 1024 * 1024:
        raise RuntimeError('Arquivo gerenciado fora do formato esperado: ' + str(path))
    data = path.read_bytes()
    if MARKER.encode('ascii') not in data[:256]:
        raise RuntimeError('Arquivo existente pertence a outra configuração: ' + str(path))
    return data, stat.S_IMODE(info.st_mode)


def sync_directory(path):
    directory = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def durable_unlink(path):
    path.unlink(missing_ok=True)
    sync_directory(path.parent)


def atomic_write(path, data, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    # A new drop-in directory must survive a crash before the remote bind is
    # published. fsync its parent entries as well as the eventual file rename.
    for directory in (path.parent, *path.parent.parents):
        sync_directory(directory)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix='.' + path.name + '.', dir=path.parent, delete=False) as target:
            temporary = Path(target.name)
            os.fchmod(target.fileno(), mode)
            target.write(data)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, path)
        temporary = None
        sync_directory(path.parent)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def remote_files(address):
    return {
        REMOTE_SCRIPT: (Path(__file__).read_bytes(), 0o700),
        REMOTE_UNIT: ((MARKER + '\n[Unit]\nDescription=Naxx Sync MySQL IP filter\n'
                      'Before=mariadb.service\n[Service]\nType=oneshot\n'
                      'ExecStart=/usr/bin/python3 ' + str(REMOTE_SCRIPT) +
                      ' --firewall-only --client-ip ' + address + '\n').encode(), 0o644),
        REMOTE_DROPIN: ((MARKER + '\n[Unit]\nRequires=' + FIREWALL_SERVICE +
                        '\nAfter=' + FIREWALL_SERVICE + '\n').encode(), 0o644),
        # Publish the remote bind last: a power loss must never leave it without
        # the persistent firewall dependency already present on disk.
        REMOTE_CONFIG: ((MARKER + '\n[mysqld]\nbind-address=0.0.0.0\n').encode(), 0o644),
    }


@contextmanager
def remote_lock():
    import fcntl
    with open('/run/lock/naxx-mysql-sync.lock', 'a', encoding='ascii') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def verify_listener():
    if mysql('SELECT @@bind_address, @@port;') != ['0.0.0.0\t3306']:
        raise RuntimeError('O MariaDB não confirmou a escuta IPv4 na porta 3306.')
    with socket.create_connection(('127.0.0.1', 3306), timeout=5) as connection:
        connection.settimeout(5)
        greeting = b''
        while len(greeting) < 5:
            packet = connection.recv(5 - len(greeting))
            if not packet:
                break
            greeting += packet
        if len(greeting) != 5 or greeting[4] != 10:
            raise RuntimeError('A porta 3306 não confirmou o protocolo MySQL.')


def allow_remote(address, listener):
    if not hasattr(os, 'geteuid') or os.geteuid() != 0:
        raise RuntimeError('Execute como root para configurar o acesso remoto.')
    for program in ('iptables-save', 'iptables-restore', 'systemctl'):
        if not shutil.which(program):
            raise RuntimeError('Comando necessário não encontrado: ' + program)
    if listener not in (['127.0.0.1\t3306'], ['0.0.0.0\t3306']):
        raise RuntimeError('O acesso remoto automático requer MariaDB IPv4 na porta 3306.')
    files = remote_files(address)
    with remote_lock():
        backups = {path: read_owned(path) for path in files}
        if listener == ['0.0.0.0\t3306'] and backups[REMOTE_CONFIG] is None:
            raise RuntimeError('A escuta remota existente não é gerenciada pelo Sync; revise-a manualmente.')
        before = firewall_state()
        restart_attempted = False
        try:
            # Restrict the port before writing any remotely listening configuration.
            apply_firewall(address)
            changed = {path: item for path, item in files.items() if backups[path] != item}
            for path, (data, mode) in changed.items():
                atomic_write(path, data, mode)
            if REMOTE_UNIT in changed or REMOTE_DROPIN in changed:
                command(['systemctl', 'daemon-reload'])
            if listener != ['0.0.0.0\t3306'] or any(path != REMOTE_SCRIPT for path in changed):
                restart_attempted = True
                command(['systemctl', 'restart', 'mariadb.service'])
            verify_listener()
        except Exception as error:
            rollback_errors = []
            # Close/restore the listener configuration before removing its
            # persistent protection. Stop restoring if any file cannot revert.
            for path, previous in reversed(list(backups.items())):
                try:
                    if previous is None:
                        durable_unlink(path)
                    else:
                        atomic_write(path, *previous)
                except Exception as rollback_error:
                    rollback_errors.append(str(rollback_error))
                    break
            try:
                command(['systemctl', 'daemon-reload'])
                if restart_attempted:
                    command(['systemctl', 'restart', 'mariadb.service'])
            except Exception as rollback_error:
                rollback_errors.append(str(rollback_error))
            if not rollback_errors:
                try:
                    restore_firewall(before)
                except Exception as rollback_error:
                    rollback_errors.append(str(rollback_error))
            if rollback_errors:
                raise RuntimeError(str(error) + '; reversão incompleta, firewall restrito preservado: ' +
                                   '; '.join(rollback_errors)) from error
            raise RuntimeError(str(error) + '; configuração anterior restaurada.') from error
    print('Acesso MySQL direto configurado na porta 3306 apenas para o IPv4 informado e loopback.')


def mysql(statement):
    result = subprocess.run(
        ['mysql', '--protocol=socket', '-u', 'root', '-N', '-B', '--raw', DATABASE],
        input=statement, encoding='utf-8', capture_output=True, check=False, timeout=30,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or 'Falha ao consultar o MariaDB local.')
    return result.stdout.splitlines()


def missing_grants(user, host):
    exists = mysql(f"SELECT COUNT(*) FROM mysql.user WHERE User='{user}' AND Host='{host}';")
    if exists != ['1']:
        raise RuntimeError(f"A conta '{user}'@'{host}' precisa existir antes de configurar o Sync.")
    tables = set(mysql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='xui' AND TABLE_TYPE='BASE TABLE';"))
    absent = TABLE_PRIVILEGES.keys() - tables
    if absent:
        raise RuntimeError('Tabelas de catálogo ausentes em xui: ' + ', '.join(sorted(absent)))
    grantee = f"CONCAT(QUOTE('{user}'), '@', QUOTE('{host}'))"
    rows = mysql(f"""
        SELECT '', PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES WHERE GRANTEE={grantee}
        UNION ALL
        SELECT '', PRIVILEGE_TYPE FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE={grantee} AND TABLE_SCHEMA='xui'
        UNION ALL
        SELECT TABLE_NAME, PRIVILEGE_TYPE FROM information_schema.TABLE_PRIVILEGES WHERE GRANTEE={grantee} AND TABLE_SCHEMA='xui';
    """)
    present = {}
    for row in rows:
        table, privilege = row.split('\t', 1)
        present.setdefault(table, set()).add(privilege)
    return {
        table: [privilege for privilege in required if privilege not in present.get('', ()) and privilege not in present.get(table, ())]
        for table, required in TABLE_PRIVILEGES.items()
    }


def grant_sql(user, host, missing):
    return '\n'.join(
        f"GRANT {', '.join(rights)} ON `{DATABASE}`.`{table}` TO '{user}'@'{host}';"
        for table, rights in missing.items() if rights
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--user', type=username, default='naxx_sync')
    parser.add_argument('--account-host', type=account_host, default='127.0.0.1', help='Host da conta MySQL existente')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='Conferir escuta, tabelas e permissões')
    mode.add_argument('--apply', action='store_true', help='Conceder os privilégios de catálogo que faltam')
    parser.add_argument('--allow-remote', action='store_true', help='Permitir acesso direto IPv4 na porta 3306, restrito ao IP do Sync')
    parser.add_argument('--client-ip', type=client_ip, help='IPv4 individual do computador do Sync (sem máscara)')
    parser.add_argument('--firewall-only', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    user, host = args.user, args.account_host
    if args.firewall_only:
        if not args.client_ip or args.allow_remote or args.apply or args.check:
            parser.error('O modo interno de firewall requer somente --client-ip.')
        if not hasattr(os, 'geteuid') or os.geteuid() != 0:
            raise RuntimeError('O firewall deve ser aplicado como root.')
        apply_firewall(args.client_ip)
        return
    if args.allow_remote and (not args.client_ip or not args.apply):
        parser.error('--allow-remote requer --apply e --client-ip IPv4.')
    if args.client_ip and not args.allow_remote:
        parser.error('--client-ip requer --allow-remote.')
    if args.allow_remote and host not in ('%', args.client_ip):
        parser.error('O host da conta MySQL deve ser % ou o mesmo IP de --client-ip.')
    listener = mysql('SELECT @@bind_address, @@port;')
    if listener:
        address, port = listener[0].split('\t', 1)
        print(f'MariaDB configurado em {address}:{port}.')
        if address in ('127.0.0.1', '::1', 'localhost'):
            print('Para o Sync em outra máquina, use um túnel SSH ou configure --allow-remote com --client-ip.')
    missing = missing_grants(user, host)
    statements = grant_sql(user, host, missing)
    if not statements:
        print('Permissões de catálogo conferidas.')
    for table, rights in missing.items():
        if rights:
            print(f'xui.{table}: faltam {", ".join(rights)}.')
    if args.apply and statements:
        mysql(statements)
        if any(missing_grants(user, host).values()):
            raise RuntimeError('O MariaDB não confirmou todas as permissões do Sync.')
        print('Permissões de catálogo aplicadas e conferidas.')
    if args.allow_remote:
        allow_remote(args.client_ip, listener)


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        print('Configuração do Sync interrompida: ' + str(error), file=sys.stderr)
        sys.exit(1)
