"""Testa o CLI de permissões do Naxx Sync sem executar o cliente MySQL."""

from contextlib import nullcontext, redirect_stderr, redirect_stdout
import importlib.util
import io
from pathlib import Path
import re
import sys
import tempfile
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

    def test_remote_flags_require_explicit_apply_address_and_remote_account(self):
        for args in (('--allow-remote',), ('--allow-remote', '--apply'),
                     ('--client-ip', '198.51.100.9'),
                     ('--allow-remote', '--apply', '--client-ip', '198.51.100.9'),
                     ('--allow-remote', '--apply', '--client-ip', '0.0.0.0', '--account-host', '%'),
                     ('--allow-remote', '--apply', '--client-ip', '198.51.100.0/24', '--account-host', '%'),
                     ('--allow-remote', '--apply', '--client-ip', '2001:db8::9', '--account-host', '%')):
            with self.subTest(args=args), redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                self.run_cli(*args)
            self.assertEqual(error.exception.code, 2)
        self.assertEqual(self.catalog.queries, [])

    def test_remote_apply_runs_even_when_account_grants_are_already_complete(self):
        with patch.object(sys, 'argv', ['sync', '--apply', '--allow-remote', '--client-ip',
                                       '198.51.100.9', '--account-host', '%']), \
             patch.object(SYNC, 'mysql', return_value=['127.0.0.1\t3306']), \
             patch.object(SYNC, 'missing_grants', return_value={table: [] for table in EXPECTED}), \
             patch.object(SYNC, 'allow_remote') as remote, redirect_stdout(io.StringIO()):
            SYNC.main()
        remote.assert_called_once_with('198.51.100.9', ['127.0.0.1\t3306'])


class RemoteSyncTests(unittest.TestCase):
    def setUp(self):
        self.empty = {'exists': False, 'rules': [], 'jumps': []}
        self.address = '198.51.100.9'
        self.rules = ['-A ' + SYNC.CHAIN + ' -i lo -j ACCEPT',
                      '-A ' + SYNC.CHAIN + ' -s ' + self.address + '/32 -j ACCEPT',
                      '-A ' + SYNC.CHAIN + ' -j DROP']
        self.configured = {'exists': True, 'rules': self.rules, 'jumps': [(1, SYNC.JUMP)]}

    def test_firewall_rebuild_changes_only_its_chain_and_one_input_jump(self):
        transaction = SYNC.firewall_transaction(self.empty, address=self.address)
        self.assertEqual(transaction, '\n'.join(('*filter', ':' + SYNC.CHAIN + ' - [0:0]',
            *self.rules, '-I INPUT 1 ' + SYNC.JUMP, 'COMMIT', '')))
        self.assertNotIn('*nat', transaction)
        self.assertNotIn('-F INPUT', transaction)
        self.assertNotIn(':INPUT', transaction)
        self.assertIn('--dport 3306', transaction)
        self.assertNotIn('0.0.0.0/0', transaction)
        updated = SYNC.firewall_transaction(self.configured, address='203.0.113.8')
        self.assertEqual(updated.count('-D INPUT ' + SYNC.JUMP), 1)
        self.assertEqual(updated.count('-I INPUT 1 ' + SYNC.JUMP), 1)
        self.assertNotIn(self.address, updated)

    def test_restore_removes_only_new_managed_chain_or_restores_prior_rules(self):
        transaction = SYNC.firewall_transaction(self.configured, restore=self.empty)
        self.assertIn('-D INPUT ' + SYNC.JUMP, transaction)
        self.assertIn('-F ' + SYNC.CHAIN + '\n-X ' + SYNC.CHAIN, transaction)
        self.assertNotIn('-F INPUT', transaction)
        restored = SYNC.firewall_transaction(self.configured, restore=self.configured)
        self.assertEqual(restored.count(self.rules[1]), 1)
        self.assertEqual(restored.count('-I INPUT 1 ' + SYNC.JUMP), 1)

    def test_firewall_state_rejects_foreign_chain_or_unexpected_references(self):
        for lines in (':' + SYNC.CHAIN + ' - [0:0]\n',
                      ':' + SYNC.CHAIN + ' - [0:0]\n-A OUTPUT -j ' + SYNC.CHAIN + '\n',
                      ':' + SYNC.CHAIN + ' - [0:0]\n-A INPUT -j ' + SYNC.CHAIN + '\n'):
            with self.subTest(lines=lines), patch.object(SYNC, 'command', return_value=SimpleNamespace(stdout=lines)):
                with self.assertRaises(RuntimeError):
                    SYNC.firewall_state()

    def test_firewall_state_keeps_unrelated_input_rules_and_applies_atomic_noflush(self):
        lines = '\n'.join(('*filter', ':INPUT ACCEPT [0:0]', ':' + SYNC.CHAIN + ' - [0:0]',
                           '-A INPUT ' + SYNC.JUMP, '-A INPUT -p tcp --dport 22 -j ACCEPT',
                           *self.rules, 'COMMIT', ''))
        with patch.object(SYNC, 'command', return_value=SimpleNamespace(stdout=lines)) as run:
            self.assertEqual(SYNC.firewall_state(), self.configured)
            self.assertEqual(run.call_args.args[0], ['iptables-save', '-t', 'filter'])
        with patch.object(SYNC, 'firewall_state', side_effect=[self.empty, self.configured]), patch.object(SYNC, 'command') as run:
            self.assertEqual(SYNC.apply_firewall(self.address), self.empty)
            self.assertEqual(run.call_count, 2)
            self.assertIn('--test', run.call_args_list[0].args[0])
            self.assertNotIn('--test', run.call_args_list[1].args[0])
            for call in run.call_args_list:
                self.assertIn('--noflush', call.args[0])
                self.assertIn('--wait', call.args[0])
                self.assertNotIn('*nat', call.kwargs['input'])

    def test_persistent_dependency_runs_firewall_before_mariadb_without_shared_lock(self):
        files = SYNC.remote_files(self.address)
        self.assertEqual(set(files), {SYNC.REMOTE_SCRIPT, SYNC.REMOTE_CONFIG, SYNC.REMOTE_UNIT, SYNC.REMOTE_DROPIN})
        self.assertEqual(list(files), [SYNC.REMOTE_SCRIPT, SYNC.REMOTE_UNIT, SYNC.REMOTE_DROPIN, SYNC.REMOTE_CONFIG])
        self.assertIn('zz-naxx-sync.cnf', str(SYNC.REMOTE_CONFIG))
        unit = files[SYNC.REMOTE_UNIT][0].decode()
        dropin = files[SYNC.REMOTE_DROPIN][0].decode()
        self.assertIn('Before=mariadb.service', unit)
        self.assertIn('--firewall-only --client-ip ' + self.address, unit)
        self.assertIn('Requires=' + SYNC.FIREWALL_SERVICE, dropin)
        self.assertIn('After=' + SYNC.FIREWALL_SERVICE, dropin)
        self.assertNotIn('RemainAfterExit=yes', unit)
        with patch.object(sys, 'argv', ['sync', '--firewall-only', '--client-ip', self.address]), \
             patch.object(SYNC.os, 'geteuid', return_value=0, create=True), \
             patch.object(SYNC, 'remote_lock', side_effect=AssertionError('boot path must not acquire caller lock')), \
             patch.object(SYNC, 'mysql', side_effect=AssertionError('boot path must not query database')), \
             patch.object(SYNC, 'apply_firewall') as firewall:
            SYNC.main()
        firewall.assert_called_once_with(self.address)

    def run_remote(self, *, fail_verify=False, fail_rollback_restart=False, fail_config_restore=False, preconfigured=False):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        paths = {name: root / name for name in ('script.py', 'firewall.service', 'dropin.conf', 'override.cnf')}
        files = {path: ((SYNC.MARKER + '\n' + name).encode(), 0o700 if name == 'script.py' else 0o644)
                 for name, path in paths.items()}
        unrelated = root / '99-naxx.cnf'
        unrelated.write_text('[mysqld]\nbind-address=127.0.0.1\nmax_connections=128\n')
        original = unrelated.read_bytes()
        events = []
        if preconfigured:
            for path, (data, _) in files.items():
                path.write_bytes(data)

        def write(path, data, mode=0o644):
            events.append(('write', path.name))
            path.write_bytes(data)

        def run(args, **kwargs):
            events.append(('command', tuple(args)))
            if fail_rollback_restart and events.count(('command', ('systemctl', 'restart', 'mariadb.service'))) > 1:
                raise RuntimeError('rollback restart failed')
            return SimpleNamespace(returncode=0, stdout='', stderr='')

        def read(path):
            return (path.read_bytes(), files[path][1]) if path.exists() else None

        original_unlink = Path.unlink

        def unlink(path, **kwargs):
            events.append(('unlink', path.name))
            if fail_config_restore and path == paths['override.cnf']:
                raise OSError('cannot restore listener configuration')
            return original_unlink(path, **kwargs)

        with patch.object(SYNC.os, 'geteuid', return_value=0, create=True), \
             patch.object(SYNC.shutil, 'which', return_value='/sbin/tool'), \
             patch.object(SYNC, 'REMOTE_SCRIPT', paths['script.py']), \
             patch.object(SYNC, 'REMOTE_CONFIG', paths['override.cnf']), \
             patch.object(SYNC, 'REMOTE_UNIT', paths['firewall.service']), \
             patch.object(SYNC, 'REMOTE_DROPIN', paths['dropin.conf']), \
             patch.object(SYNC, 'remote_files', return_value=files), \
             patch.object(SYNC, 'read_owned', side_effect=read), \
             patch.object(SYNC, 'remote_lock', return_value=nullcontext()), \
             patch.object(SYNC, 'firewall_state', return_value=self.configured if preconfigured else self.empty), \
             patch.object(SYNC, 'apply_firewall', side_effect=lambda ip: events.append(('firewall', ip))), \
             patch.object(SYNC, 'restore_firewall', side_effect=lambda before: events.append(('restore_firewall', before))), \
             patch.object(SYNC, 'atomic_write', side_effect=write), \
             patch.object(Path, 'unlink', autospec=True, side_effect=unlink), \
             patch.object(SYNC, 'sync_directory', side_effect=lambda path: events.append(('fsync_dir', path.name))), \
             patch.object(SYNC, 'command', side_effect=run), \
             patch.object(SYNC, 'verify_listener', side_effect=RuntimeError('listener failed') if fail_verify else None), \
             redirect_stdout(io.StringIO()):
            error = None
            try:
                SYNC.allow_remote(self.address, ['0.0.0.0\t3306'] if preconfigured else ['127.0.0.1\t3306'])
            except RuntimeError as caught:
                error = caught
        self.assertEqual(unrelated.read_bytes(), original)
        return events, files, error

    def test_remote_apply_restricts_firewall_before_files_and_database_restart(self):
        events, files, error = self.run_remote()
        self.assertIsNone(error)
        self.assertEqual(events[0], ('firewall', self.address))
        restart = events.index(('command', ('systemctl', 'restart', 'mariadb.service')))
        self.assertTrue(all(events.index(('write', path.name)) < restart for path in files))
        self.assertEqual([event[1] for event in events if event[0] == 'write'],
                         ['script.py', 'firewall.service', 'dropin.conf', 'override.cnf'])
        self.assertFalse(any(event[0] == 'restore_firewall' for event in events))

    def test_repeat_keeps_database_running_and_does_not_rewrite_files(self):
        events, _, error = self.run_remote(preconfigured=True)
        self.assertIsNone(error)
        self.assertEqual(events, [('firewall', self.address)])

    def test_failed_listener_restores_previous_files_then_database_then_firewall(self):
        events, files, error = self.run_remote(fail_verify=True)
        self.assertIn('configuração anterior restaurada', str(error))
        self.assertTrue(all(not path.exists() for path in files))
        self.assertEqual(events.count(('command', ('systemctl', 'restart', 'mariadb.service'))), 2)
        self.assertEqual([event[1] for event in events if event[0] == 'unlink'],
                         ['override.cnf', 'dropin.conf', 'firewall.service', 'script.py'])
        self.assertEqual(events[-1][0], 'restore_firewall')
        for index, event in enumerate(events):
            if event[0] == 'unlink':
                self.assertEqual(events[index + 1][0], 'fsync_dir')

    def test_failed_rollback_keeps_restrictive_firewall(self):
        events, _, error = self.run_remote(fail_verify=True, fail_rollback_restart=True)
        self.assertIn('firewall restrito preservado', str(error))
        self.assertFalse(any(event[0] == 'restore_firewall' for event in events))

    def test_failed_config_restore_keeps_every_persistent_firewall_file(self):
        events, files, error = self.run_remote(fail_verify=True, fail_config_restore=True)
        self.assertIn('firewall restrito preservado', str(error))
        self.assertTrue(all(path.exists() for path in files))
        self.assertEqual([event[1] for event in events if event[0] == 'unlink'], ['override.cnf'])
        self.assertFalse(any(event[0] == 'restore_firewall' for event in events))

    def test_existing_unowned_file_or_symlink_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'override.cnf'
            path.write_bytes(b'[mysqld]\nbind-address=192.0.2.8\n')
            before = path.read_bytes()
            with self.assertRaisesRegex(RuntimeError, 'pertence a outra'):
                SYNC.read_owned(path)
            self.assertEqual(path.read_bytes(), before)
            with patch.object(Path, 'is_symlink', return_value=True):
                with self.assertRaisesRegex(RuntimeError, 'link simbólico'):
                    SYNC.read_owned(path)

    def test_mysql_header_can_arrive_in_fragments(self):
        with patch.object(SYNC, 'mysql', return_value=['0.0.0.0\t3306']), \
             patch.object(SYNC.socket, 'create_connection') as connect:
            client = connect.return_value.__enter__.return_value
            client.recv.side_effect = [b'\x6a', b'\x00\x00', b'\x00\x0a']
            SYNC.verify_listener()
            self.assertEqual(client.recv.call_count, 3)


if __name__ == '__main__':
    unittest.main()
