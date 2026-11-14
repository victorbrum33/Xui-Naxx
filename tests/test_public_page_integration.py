"""Offline integration checks: every service call is mocked; only temporary files change."""
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socketserver
import sys
import tempfile
import types
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / 'scripts'
if not (SCRIPTS / 'naxx_update.py').is_file():
    SCRIPTS = Path(__file__).resolve().parent / 'integration/scripts'


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    result = importlib.util.module_from_spec(spec)
    with contextlib.ExitStack() as stack:
        if not hasattr(socketserver, 'ThreadingUnixStreamServer'):
            stack.enter_context(mock.patch.object(socketserver, 'ThreadingUnixStreamServer', socketserver.ThreadingTCPServer, create=True))
        for dependency in ('fcntl', 'pwd'):
            try:
                __import__(dependency)
            except ImportError:
                stack.enter_context(mock.patch.dict(sys.modules, {dependency: types.ModuleType(dependency)}))
        spec.loader.exec_module(result)
    return result


updater = module('public_page_updater_fixture', 'naxx_update.py')
installer = module('public_page_installer_fixture', 'instalar_atualizador.py')


class DispatchTests(unittest.TestCase):
    def setUp(self):
        self.manager = updater.Manager.__new__(updater.Manager)

    def helper(self):
        helper = types.ModuleType('naxx_public_page')
        class PageError(Exception):
            def __init__(self, message, status=409):
                super().__init__(message)
                self.status = status
        helper.PublicPageError = PageError
        helper.control_public_page = mock.Mock(return_value={'ok': True, 'state': {'selected': 'original'}})
        return helper

    def test_only_four_exact_actions_reach_public_helper(self):
        helper = self.helper()
        with mock.patch.dict(sys.modules, {'naxx_public_page': helper}):
            for suffix in ('status', 'preview', 'publish', 'restore'):
                action = 'public_page_' + suffix
                request = {'action': action}
                if suffix in ('preview', 'publish'): request['theme'] = 'naxx'
                result = self.manager.dispatch(request, 115)
                self.assertTrue(result['ok'])
                helper.control_public_page.assert_called_with(action, request)
            helper.control_public_page.reset_mock()
            for action in ('public_page_delete', 'public_page_publish;id', '../publish', None):
                with self.assertRaises(updater.UpdateError):
                    self.manager.dispatch({'action': action}, 115)
            helper.control_public_page.assert_not_called()

    def test_helper_error_status_and_message_are_preserved(self):
        helper = self.helper()
        helper.control_public_page.side_effect = helper.PublicPageError('fixture conflict', 409)
        with mock.patch.dict(sys.modules, {'naxx_public_page': helper}):
            with self.assertRaises(updater.UpdateError) as caught:
                self.manager.dispatch({'action': 'public_page_publish', 'theme': 'naxx'}, 115)
        self.assertEqual((str(caught.exception), caught.exception.status), ('fixture conflict', 409))

    def test_absent_helper_fails_closed_without_affecting_update_status(self):
        self.manager.snapshot = lambda: {'installed': '1.14.2', 'automatic': True}
        with mock.patch.dict(sys.modules, {'naxx_public_page': None}):
            with self.assertRaises(updater.UpdateError) as caught:
                self.manager.dispatch({'action': 'public_page_status'}, 115)
            self.assertEqual(caught.exception.status, 503)
            self.assertEqual(self.manager.dispatch({'action': 'status'}, 115),
                {'ok': True, 'state': {'installed': '1.14.2', 'automatic': True}})


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='naxx-installer-fixture-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / 'clone/scripts'
        self.source.mkdir(parents=True)
        self.themes = self.base / 'clone/xui-naxx/src/public-themes'
        self.themes.mkdir(parents=True)
        for name in installer.FILES:
            (self.source / name).write_bytes(('fixture source ' + name).encode())
        for name in installer.THEME_FILES:
            content = json.dumps([{'id': theme, 'file': theme + '.html'} for theme in ('naxx', 'aurora', 'claro', 'cinema')]) if name == 'catalog.json' else '<!doctype html><html><body>' + name + '</body></html>'
            (self.themes / name).write_text(content, encoding='utf-8')
        self.runtime = self.base / 'installed/state'
        self.runtime.mkdir(parents=True)
        self.configuration = b'{"automatic":false,"repository":"victorbrum33/Xui-Naxx-Updates","fixture":"preserve"}\n'
        (self.runtime / 'config.json').write_bytes(self.configuration)
        (self.runtime / 'state.json').write_bytes(b'{"busy":false,"history":["preserve"]}\n')
        self.page_runtime = self.base / 'installed/public-page-state'
        self.page_runtime.mkdir()
        self.page_runtime.chmod(0o700)
        (self.page_runtime / 'original.html').write_bytes(b'fixture original backup')
        self.library = self.base / 'installed/lib/naxx'
        self.units = self.base / 'installed/units'
        self.target = self.base / 'installed/lib/naxx-public-page/themes'
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        replacements = {'HERE': self.source, 'LIBRARY': self.library, 'UNITS': self.units,
            'RUNTIME': self.runtime, 'THEME_SOURCE': self.themes, 'THEME_TARGET': self.target,
            'PUBLIC_RUNTIME': self.page_runtime}
        for name, value in replacements.items(): stack.enter_context(mock.patch.object(installer, name, value))
        stack.enter_context(mock.patch.object(installer.platform, 'system', return_value='Linux'))
        stack.enter_context(mock.patch.object(installer.os, 'geteuid', return_value=0, create=True))
        stack.enter_context(mock.patch.object(installer.os, 'fchown', return_value=None, create=True))
        stack.enter_context(mock.patch.object(installer.os, 'chown', return_value=None, create=True))
        if os.name == 'nt':
            original_stat = Path.stat
            page_runtime = self.page_runtime
            def private_runtime_info(path, *args, **kwargs):
                result = original_stat(path, *args, **kwargs)
                if path == page_runtime:
                    values = list(result)
                    values[0] = (values[0] & ~0o777) | 0o700
                    result = os.stat_result(values)
                return result
            stack.enter_context(mock.patch.object(Path, 'stat', private_runtime_info))
        # Fixture ancestors may be user-owned or /tmp. Retain symlink guards while
        # bypassing only production ownership checks for this isolated fixture.
        checked = installer.checked_path
        stack.enter_context(mock.patch.object(installer, 'checked_path', side_effect=lambda path, trusted=False: checked(path, trusted=False)))
        self.query = stack.enter_context(mock.patch.object(installer.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)))
        self.commands = stack.enter_context(mock.patch.object(installer, 'run'))
        self.before_state = (self.runtime / 'state.json').read_bytes()

    def test_install_preserves_preferences_backup_and_restarts_only_updater(self):
        installer.install()
        self.assertEqual((self.runtime / 'config.json').read_bytes(), self.configuration)
        self.assertEqual((self.runtime / 'state.json').read_bytes(), self.before_state)
        self.assertEqual((self.page_runtime / 'original.html').read_bytes(), b'fixture original backup')
        self.assertEqual({path.name for path in self.target.iterdir()}, set(installer.THEME_FILES))
        for name in installer.THEME_FILES:
            self.assertEqual((self.target / name).read_bytes(), (self.themes / name).read_bytes())
        self.assertEqual({path.name for path in self.library.iterdir()}, {'naxx_update.py', 'naxx_public_page.py'})
        self.assertEqual([call.args for call in self.commands.call_args_list], [
            ('systemctl', 'daemon-reload'), ('systemctl', 'restart', 'naxx-update.service'),
            ('systemctl', 'enable', '--now', 'naxx-update.service', 'naxx-update.timer')])
        self.assertFalse(any(path.name == 'index.html' for path in self.base.rglob('*')))

    def test_missing_theme_is_rejected_before_file_or_service_changes(self):
        (self.themes / 'cinema.html').unlink()
        with self.assertRaises(RuntimeError): installer.install()
        self.query.assert_not_called()
        self.commands.assert_not_called()
        self.assertFalse(self.library.exists())
        self.assertFalse(self.target.exists())
        self.assertEqual((self.runtime / 'config.json').read_bytes(), self.configuration)

    def test_busy_updater_is_not_replaced(self):
        (self.runtime / 'state.json').write_bytes(b'{"busy":true}')
        with self.assertRaises(RuntimeError): installer.install()
        self.commands.assert_not_called()
        self.assertFalse(self.library.exists())
        self.assertFalse(self.target.exists())

    def test_template_source_symlink_is_rejected_before_services(self):
        source = self.themes / 'cinema.html'
        source.unlink()
        try:
            source.symlink_to(self.themes / 'naxx.html')
        except OSError:
            self.skipTest('Creating symlinks requires OS permission')
        with self.assertRaises(RuntimeError): installer.install()
        self.query.assert_not_called()
        self.commands.assert_not_called()


class ServiceTests(unittest.TestCase):
    def test_service_keeps_hardening_and_only_bounded_write_paths(self):
        text = (SCRIPTS / 'naxx-update.service').read_text(encoding='utf-8')
        for value in ('User=root', 'Group=root', 'NoNewPrivileges=true', 'ProtectHome=read-only',
                      'ProtectSystem=strict', 'PrivateTmp=true', 'RestrictSUIDSGID=true',
                      'ExecStart=/usr/bin/python3 /usr/local/lib/naxx/naxx_update.py --daemon'):
            self.assertIn(value + '\n', text)
        write_paths = [line.split('=', 1)[1] for line in text.splitlines() if line.startswith('ReadWritePaths=')]
        self.assertEqual(write_paths, ['/var/lib/naxx-updates /run/naxx-update /home/xui/admin /home/xui/includes/langs /home/xui/www /var/lib/naxx-public-page'])
        self.assertNotIn('nginx.service', text)


if __name__ == '__main__':
    unittest.main(verbosity=2)
