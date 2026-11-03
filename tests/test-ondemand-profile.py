"""Regressões locais do perfil; não acessam VM, banco ou PHP reais."""
import importlib.util
from pathlib import Path
import re
import unittest
from unittest.mock import patch

PROFILE = Path(__file__).resolve().parents[1] / 'scripts/otimizar_ondemand.py'
spec = importlib.util.spec_from_file_location('ondemand_profile', PROFILE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

BEFORE = {'seg_time': 10, 'seg_list_size': 6, 'seg_delete_threshold': 4}
AFTER = {'seg_time': 2, 'seg_list_size': 30, 'seg_delete_threshold': 20}


class Backend:
    """Estado externo independente para exercitar CAS e recuperação de falhas."""
    def __init__(self):
        self.database = BEFORE.copy()
        self.cache = BEFORE.copy()
        self.fail_cache = False
        self.concurrent_edit = False

    def mysql(self, database, sql):
        if sql.startswith('SELECT id,'):
            return '1\t' + '\t'.join(str(self.database[key]) for key in module.KEYS)
        match = re.fullmatch(r'UPDATE settings SET (.+) WHERE id=1 AND (.+?)(?:;SELECT ROW_COUNT\(\);?)?', sql)
        if not match:
            raise AssertionError('SQL inesperado no teste: ' + sql)
        assignments = dict((key, int(value)) for key, value in re.findall(r'(\w+)=(\d+)', match[1]))
        expected = dict((key, int(value)) for key, value in re.findall(r'(\w+)=(\d+)', match[2]))
        if any(self.database.get(key) != value for key, value in expected.items()):
            return '0'
        self.database.update(assignments)
        return '1'

    def php(self, root, values=None, *args, **kwargs):
        if values is not None:
            expected = args[0] if args else kwargs.get('expected')
            if expected is None or self.cache != expected:
                raise RuntimeError('CAS do cache recusou uma configuração diferente.')
            if self.fail_cache:
                self.fail_cache = False
                if self.concurrent_edit:
                    # Uma edição independente chega depois do CAS de aplicação.
                    self.database = {'seg_time': 3, 'seg_list_size': 20, 'seg_delete_threshold': 14}
                    self.cache = self.database.copy()
                raise RuntimeError('Falha de escrita simulada.')
            self.cache = values.copy()
        return self.cache.copy()


class ProfileTests(unittest.TestCase):
    def test_preserves_time_windows_instead_of_segment_counts(self):
        target = module.profile(BEFORE)
        self.assertEqual(target, AFTER)
        for key in module.KEYS[1:]:
            self.assertGreaterEqual(target[key] * target['seg_time'], BEFORE[key] * BEFORE['seg_time'])

    def test_rounds_up_odd_durations_to_avoid_losing_buffer(self):
        current = {'seg_time': 3, 'seg_list_size': 5, 'seg_delete_threshold': 3}
        target = module.profile(current)
        self.assertEqual(target, {'seg_time': 2, 'seg_list_size': 8, 'seg_delete_threshold': 5})

    def test_keeps_faster_configuration_and_is_idempotent(self):
        faster = {'seg_time': 1, 'seg_list_size': 60, 'seg_delete_threshold': 40}
        self.assertEqual(module.profile(faster), faster)
        self.assertEqual(module.profile(AFTER), AFTER)

    def test_rejects_unrepresentable_window(self):
        with self.assertRaises(RuntimeError):
            module.profile({'seg_time': 60, 'seg_list_size': 120, 'seg_delete_threshold': 4})

    def run_update(self, backend, before, after):
        with patch.object(module, 'mysql', backend.mysql), patch.object(module, 'php', backend.php):
            module.update(Path('/fixture'), 'xui', 1, before, after)

    def test_apply_and_restore_keep_both_representations_equal(self):
        backend = Backend()
        self.run_update(backend, BEFORE, AFTER)
        self.assertEqual(backend.database, AFTER)
        self.assertEqual(backend.cache, AFTER)
        self.run_update(backend, AFTER, BEFORE)
        self.assertEqual(backend.database, BEFORE)
        self.assertEqual(backend.cache, BEFORE)

    def test_cache_failure_rolls_back_database(self):
        backend = Backend()
        backend.fail_cache = True
        with self.assertRaises(RuntimeError):
            self.run_update(backend, BEFORE, AFTER)
        self.assertEqual(backend.database, BEFORE)
        self.assertEqual(backend.cache, BEFORE)

    def test_rollback_preserves_concurrent_edit(self):
        backend = Backend()
        backend.fail_cache = True
        backend.concurrent_edit = True
        with self.assertRaises(RuntimeError):
            self.run_update(backend, BEFORE, AFTER)
        self.assertEqual(backend.database['seg_time'], 3)
        self.assertEqual(backend.cache, backend.database)

    def test_cas_conflict_does_not_write_cache(self):
        backend = Backend()
        backend.database['seg_time'] = 3
        backend.cache = backend.database.copy()
        with self.assertRaises(RuntimeError):
            self.run_update(backend, BEFORE, AFTER)
        self.assertEqual(backend.database['seg_time'], 3)
        self.assertEqual(backend.cache, backend.database)


if __name__ == '__main__':
    unittest.main()
