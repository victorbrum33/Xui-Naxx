"""Fixtures locais: nenhum socket MariaDB ou serviço real é usado."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/otimizar_memoria_mysql.py'
SPEC = importlib.util.spec_from_file_location('mysql_memory', SOURCE)
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class MemoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='naxx-memory-test-')
        self.folder = Path(self.temporary.name)
        self.config = self.folder / 'config' / 'zz-naxx-memory.cnf'
        self.config.parent.mkdir()
        self.backups = self.folder / 'backups'
        self.pidfile = self.folder / 'mysql.pid'
        self.pidfile.write_text('1234\n')
        self.cache, self.cached, self.created = 128, 34, 39
        self.version, self.handling = '10.3.39-MariaDB', 'one-thread-per-connection'
        self.commands, self.fail_set, self.fail_flush = [], False, False
        self.config_mode, self.config_uid = 0o644, 0
        actual_stat = os.stat

        def owned_stat(path, *args, **kwargs):
            value = actual_stat(path, *args, **kwargs)
            if os.fspath(path) == str(self.config) and kwargs.get('follow_symlinks', True):
                fields = list(value)
                fields[0] = (value.st_mode & ~0o777) | self.config_mode
                fields[4] = self.config_uid
                return os.stat_result(fields)
            return value

        patches = [mock.patch.object(m, 'CONFIG', self.config), mock.patch.object(m, 'BACKUPS', self.backups),
                   mock.patch.object(m.sys, 'platform', 'linux'), mock.patch.object(m.os, 'geteuid', return_value=0, create=True),
                   mock.patch.object(m, 'command', side_effect=self.command), mock.patch.object(m.os, 'stat', side_effect=owned_stat)]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        self.addCleanup(self.temporary.cleanup)

    def command(self, args):
        self.commands.append(args)
        if args[0] == 'mysqladmin':
            self.assertEqual(args, ['mysqladmin', '--protocol=socket', '-u', 'root', 'flush-threads'])
            if self.fail_flush:
                raise m.MemoryError('fixture flush failed')
            self.cached = 0
            return ''
        self.assertEqual(args[:7], ['mysql', '--protocol=socket', '-u', 'root', '-N', '-B', '-e'])
        statement = args[-1]
        if statement.startswith('SELECT VERSION()'):
            return '{}\t{}\t{}\t{}\n'.format(self.version, self.handling, self.cache, self.pidfile)
        if statement.startswith('SHOW GLOBAL STATUS WHERE'):
            return 'Threads_cached\t{}\nThreads_connected\t5\nThreads_created\t{}\nUptime\t110433\n'.format(self.cached, self.created)
        if statement.startswith('SET GLOBAL thread_cache_size = '):
            if self.fail_set:
                self.fail_set = False
                raise m.MemoryError('fixture set failed')
            self.cache = int(statement.split(' = ')[1].rstrip(';'))
            return ''
        self.fail('SQL fora do escopo: ' + statement)

    def writes(self):
        return [args for args in self.commands if args[0] == 'mysqladmin' or args[-1].startswith('SET ')]

    def managed(self, value):
        return (m.MARKER + str(value) + '\n').encode()

    def test_check_has_no_changes_or_backup(self):
        before = set(self.folder.rglob('*'))
        result = m.execute()
        self.assertEqual(result['target'], 8)
        self.assertFalse(result['modified'])
        self.assertTrue(result['changes_needed'])
        self.assertEqual(result['config'], str(self.config))
        self.assertFalse(result['would_flush_idle'])
        self.assertFalse(result['restart'])
        self.assertEqual(self.cache, 128)
        self.assertEqual(self.writes(), [])
        self.assertEqual(set(self.folder.rglob('*')), before)

    def test_apply_persists_only_target_and_is_idempotent(self):
        result = m.execute(apply=True)
        self.assertEqual(self.config.read_bytes(), self.managed(8))
        self.assertEqual(self.cache, 8)
        self.assertTrue(result['modified'])
        self.assertFalse(result['flushed'])
        saved = json.loads(Path(result['backup']).read_text())
        self.assertEqual(saved['before']['thread_cache_size'], 128)
        self.assertIsNone(saved['previous_base64'])
        self.assertEqual(len(self.writes()), 1)
        count = len(list(self.backups.iterdir()))
        second = m.execute(apply=True)
        self.assertFalse(second['modified'])
        self.assertFalse(second['changes_needed'])
        self.assertEqual(len(list(self.backups.iterdir())), count)
        self.assertEqual(len(self.writes()), 1)
        if os.name == 'posix':
            self.assertEqual(Path(result['backup']).stat().st_mode & 0o777, 0o600)
            self.assertEqual(self.backups.stat().st_mode & 0o777, 0o700)

    def test_does_not_raise_existing_lower_limit(self):
        self.cache = 4
        m.execute(apply=True)
        self.assertEqual(self.config.read_bytes(), self.managed(4))
        self.assertEqual(self.cache, 4)
        self.assertEqual(self.writes(), [])

    def test_flush_is_explicit_and_only_above_target(self):
        m.execute(apply=True, flush_idle=True)
        self.assertEqual(self.cached, 0)
        self.assertEqual(sum(args[0] == 'mysqladmin' for args in self.commands), 1)
        self.cached = 8
        m.execute(apply=True, flush_idle=True)
        self.assertEqual(sum(args[0] == 'mysqladmin' for args in self.commands), 1)
        self.cached = 34
        m.execute(apply=False, flush_idle=True)
        self.assertEqual(self.cached, 34)

    def test_foreign_file_symlink_owner_and_mode_are_refused(self):
        self.config.write_text('[mysqld]\nother_option=1\n')
        with self.assertRaises(m.MemoryError):
            m.execute(apply=True)
        self.assertEqual(self.writes(), [])
        self.config.write_bytes(self.managed(8))
        for attribute, value in [('config_uid', 999), ('config_mode', 0o666)]:
            previous = getattr(self, attribute)
            setattr(self, attribute, value)
            with self.assertRaises(m.MemoryError):
                m.execute(apply=True)
            setattr(self, attribute, previous)
        with mock.patch.object(type(self.config), 'is_symlink', return_value=True):
            with self.assertRaises(m.MemoryError):
                m.execute(apply=True)
        self.assertFalse(self.backups.exists())

    def test_unsupported_manager_or_version_refuses_changes(self):
        for attribute, value in [('version', '10.11.8-MariaDB'), ('handling', 'pool-of-threads')]:
            previous = getattr(self, attribute)
            setattr(self, attribute, value)
            with self.assertRaises(m.MemoryError):
                m.execute(apply=True)
            setattr(self, attribute, previous)
        self.assertEqual(self.writes(), [])
        self.assertFalse(self.backups.exists())

    def test_set_failure_rolls_back_config(self):
        original = self.managed(3)
        self.config.write_bytes(original)
        self.fail_set = True
        with self.assertRaisesRegex(m.MemoryError, 'anterior restaurada'):
            m.execute(apply=True)
        self.assertEqual(self.cache, 128)
        self.assertEqual(self.config.read_bytes(), original)

    def test_write_failure_leaves_global_and_file_unchanged(self):
        with mock.patch.object(m, 'atomic_write', side_effect=OSError('fixture write failure')):
            with self.assertRaisesRegex(m.MemoryError, 'anterior restaurada'):
                m.execute(apply=True)
        self.assertFalse(self.config.exists())
        self.assertEqual(self.cache, 128)
        self.assertEqual(self.writes(), [])

    def test_flush_failure_rolls_back_owned_global_and_file(self):
        self.fail_flush = True
        with self.assertRaisesRegex(m.MemoryError, 'anterior restaurada'):
            m.execute(apply=True, flush_idle=True)
        self.assertEqual(self.cache, 128)
        self.assertFalse(self.config.exists())

    def test_conflicting_global_is_not_overwritten_by_rollback(self):
        actual = self.command
        def changed(args):
            if args[0] == 'mysqladmin':
                self.cache = 12
                raise m.MemoryError('fixture concurrent edit')
            return actual(args)
        with mock.patch.object(m, 'command', side_effect=changed):
            with self.assertRaisesRegex(m.MemoryError, 'manual necessária'):
                m.execute(apply=True, flush_idle=True)
        self.assertEqual(self.cache, 12)
        self.assertFalse(self.config.exists())

    def test_preapply_global_or_file_conflict_is_preserved(self):
        actual = m.backup
        for conflict in ('global', 'file'):
            self.cache = 128
            if self.config.exists():
                self.config.unlink()
            def changed(*args):
                saved = actual(*args)
                if conflict == 'global':
                    self.cache = 12
                else:
                    self.config.write_text('[mysqld]\nforeign=1\n')
                return saved
            with mock.patch.object(m, 'backup', side_effect=changed):
                with self.assertRaises(m.MemoryError):
                    m.execute(apply=True)
            self.assertEqual(self.cache, 12 if conflict == 'global' else 128)
            if conflict == 'file':
                self.assertEqual(self.config.read_text(), '[mysqld]\nforeign=1\n')
        self.assertEqual(self.writes(), [])

    def test_ambiguous_set_failure_restores_our_runtime_value(self):
        actual = self.command
        failed = [False]
        def applied_then_failed(args):
            result = actual(args)
            if args[-1] == 'SET GLOBAL thread_cache_size = 8;' and not failed[0]:
                failed[0] = True
                raise OSError('fixture response lost after successful SET')
            return result
        with mock.patch.object(m, 'command', side_effect=applied_then_failed):
            with self.assertRaisesRegex(m.MemoryError, 'anterior restaurada'):
                m.execute(apply=True)
        self.assertEqual(self.cache, 128)
        self.assertFalse(self.config.exists())


if __name__ == '__main__':
    unittest.main()
