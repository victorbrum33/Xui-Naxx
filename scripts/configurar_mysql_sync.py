#!/usr/bin/env python3
"""Confere e concede as permissões de catálogo exigidas pelo Naxx Sync."""

import argparse
import ipaddress
import re
import subprocess
import sys


DATABASE = 'xui'
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
    args = parser.parse_args()
    user, host = args.user, args.account_host
    listener = mysql('SELECT @@bind_address, @@port;')
    if listener:
        address, port = listener[0].split('\t', 1)
        print(f'MariaDB configurado em {address}:{port}.')
        if address in ('127.0.0.1', '::1', 'localhost'):
            print('Para o Sync em outra máquina, use um túnel SSH.')
    missing = missing_grants(user, host)
    statements = grant_sql(user, host, missing)
    if not statements:
        print('Permissões de catálogo conferidas.')
        return
    for table, rights in missing.items():
        if rights:
            print(f'xui.{table}: faltam {", ".join(rights)}.')
    if args.apply:
        mysql(statements)
        if any(missing_grants(user, host).values()):
            raise RuntimeError('O MariaDB não confirmou todas as permissões do Sync.')
        print('Permissões de catálogo aplicadas e conferidas.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        print('Configuração do Sync interrompida: ' + str(error), file=sys.stderr)
        sys.exit(1)
