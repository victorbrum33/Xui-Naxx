"""Testa o CLI de permissões do Naxx Sync sem executar o cliente MySQL."""

from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
from pathlib import Path
import re
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'publicacao/linux/scripts/configurar_mysql_sync.py'
if not SOURCE.is_file():
    SOURCE = ROOT / 'scripts/configurar_mysql_sync.py'
SPEC = importlib.util.spec_from_file_location('configurar_mysql_sync', SOURCE)
SYNC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SYNC)

EXPECTED = {
    'streams': {'SELECT', 'INSERT', 'UPDATE', 'DELETE'},
    'streams_series': {'SELECT', 'INSERT', 'UPDATE', 'DELETE'},
    'streams_categories': {'SELECT', 'INSERT', 'UPDATE', 'DELETE'},
    'streams_servers': {'SELECT', 'INSERT', 'DELETE'},
    'streams_episodes': {'SELECT', 'INSERT', 'DELETE'},
    'epg_channels': {'SELECT', 'INSERT', 'DELETE'},
    'epg_data': {'SELECT', 'INSERT', 'DELETE'},
    'bouquets': {'SELECT', 'INSERT', 'UPDATE'},
    'epg': {'SELECT', 'INSERT', 'UPDATE'},
}


class Catalog:
    def __init__(self, test):
        self.test = test
        self.exists = True
        self.tables = set(EXPECTED)
        self.broad_rights = set()
        self.table_rights = {}
        self.apply_rights = True
        self.queries = []
        self.grant_batches = []

    def __call__(self, command, *, input, capture_output, **options):
        self.test.assertEqual(command[0], 'mysql')
        self.test.assertIn('--protocol=socket', command)
        self.test.assertTrue(capture_output)
        self.test.assertGreater(options['timeout'], 0)
        query = input.strip()
        self.queries.append(query)
        if query.startswith('SELECT @@bind_address, @@port'):
            rows = ['127.0.0.1\t3306']
        elif query.startswith('SELECT COUNT(*) FROM mysql.user'):
            self.test.assertIn("User='naxx_sync' AND Host='127.0.0.1'", query)
            rows = ['1' if self.exists else '0']
        elif 'information_schema.TABLES' in query:
            rows = sorted(self.tables)
        elif 'information_schema.TABLE_PRIVILEGES' in query:
            rows = [f'\t{right}' for right in sorted(self.broad_rights)]
            for table, rights in sorted(self.table_rights.items()):
                rows.extend(f'{table}\t{right}' for right in sorted(rights))
        elif query.startswith('GRANT '):
            self.grant_batches.append(query)
            for statement in query.splitlines():
                match = re.fullmatch(
                    r"GRANT ([A-Z, ]+) ON `xui`\.`([a-z_]+)` TO 'naxx_sync'@'127\.0\.0\.1';",
                    statement,
                )
                self.test.assertIsNotNone(match, f'Comando fora do escopo de catálogo: {statement}')
                rights, table = match.groups()
                self.test.assertIn(table, EXPECTED)
                if self.apply_rights:
                    self.table_rights.setdefault(table, set()).update(rights.split(', '))
            rows = []
        else:
            self.test.fail(f'Comando inesperado: {query}')
        return SimpleNamespace(returncode=0, stdout=''.join(f'{row}\n' for row in rows), stderr='')


class MysqlSyncTests(unittest.TestCase):
    def setUp(self):
        self.catalog = Catalog(self)

    def run_cli(self, *args):
        output = io.StringIO()
        with patch.object(sys, 'argv', ['configurar_mysql_sync.py', *args]), patch.object(
            SYNC.subprocess, 'run', side_effect=self.catalog,
        ), redirect_stdout(output):
            SYNC.main()
        return output.getvalue()

    def test_missing_account_stops_before_catalog_or_grants(self):
        self.catalog.exists = False
        with self.assertRaisesRegex(RuntimeError, r"'naxx_sync'@'127\.0\.0\.1'.*precisa existir"):
            self.run_cli('--apply')
        self.assertEqual(len(self.catalog.queries), 2)
        self.assertEqual(self.catalog.grant_batches, [])

    def test_missing_tables_are_reported_before_grants(self):
        self.catalog.tables.difference_update({'streams_servers', 'epg_data'})
        with self.assertRaisesRegex(RuntimeError, r'Tabelas.*epg_data, streams_servers'):
            self.run_cli('--apply')
        self.assertEqual(self.catalog.grant_batches, [])
        self.assertFalse(any('information_schema.TABLE_PRIVILEGES' in sql for sql in self.catalog.queries))

    def test_plan_reuses_existing_select_and_table_privileges(self):
        self.catalog.broad_rights.add('SELECT')
        self.catalog.table_rights['streams'] = {'INSERT', 'UPDATE'}
        output = self.run_cli('--check')
        self.assertIn('túnel SSH', output)
        self.assertIn('xui.streams: faltam DELETE.', output)
        self.assertIn('xui.streams_servers: faltam INSERT, DELETE.', output)
        self.assertIn('xui.bouquets: faltam INSERT, UPDATE.', output)
        self.assertNotIn('faltam SELECT', output)
        self.assertEqual(self.catalog.grant_batches, [])

    def test_apply_grants_only_missing_table_rights_and_is_idempotent(self):
        self.catalog.table_rights['streams'] = {'SELECT'}
        output = self.run_cli('--apply')
        self.assertIn('aplicadas e conferidas', output)
        self.assertEqual(self.catalog.table_rights, EXPECTED)
        self.assertEqual(len(self.catalog.grant_batches), 1)
        self.assertIn(
            "GRANT INSERT, UPDATE, DELETE ON `xui`.`streams` TO 'naxx_sync'@'127.0.0.1';",
            self.catalog.grant_batches[0].splitlines(),
        )
        self.assertIn('Permissões de catálogo conferidas.', self.run_cli('--apply'))
        self.assertEqual(len(self.catalog.grant_batches), 1)

    def test_apply_fails_if_grants_remain_missing(self):
        self.catalog.apply_rights = False
        with self.assertRaisesRegex(RuntimeError, r'não confirmou todas as permissões'):
            self.run_cli('--apply')
        self.assertEqual(len(self.catalog.grant_batches), 1)

    def test_accepts_dedicated_users_and_supported_hosts(self):
        self.assertEqual(SYNC.username('Sync_42'), 'Sync_42')
        for supplied, expected in (
            ('127.0.0.1', '127.0.0.1'), ('2001:0db8::2', '2001:db8::2'),
            ('localhost', 'localhost'), ('%', '%'),
        ):
            with self.subTest(host=supplied):
                self.assertEqual(SYNC.account_host(supplied), expected)

    def test_rejects_invalid_account_arguments_before_contacting_mysql(self):
        for option, value in (
            ('--user', 'ROOT'), ('--user', ''), ('--user', 'a' * 33), ('--user', "bad'user"),
            ('--account-host', '10.%'), ('--account-host', 'fe80::1%eth0'),
            ('--account-host', '127.0.0.1:3306'), ('--account-host', 'other.example'),
        ):
            with self.subTest(option=option, value=value), redirect_stderr(io.StringIO()), self.assertRaises(
                SystemExit,
            ) as error:
                self.run_cli('--apply', option, value)
            self.assertEqual(error.exception.code, 2)
        self.assertEqual(self.catalog.queries, [])


if __name__ == '__main__':
    unittest.main()
