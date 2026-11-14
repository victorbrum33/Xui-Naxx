"""Offline guards. Run Python everywhere; POSIX root fixtures also test atomic IO."""
import hashlib
import http.cookiejar
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import stat
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('naxx_public_page', ROOT / 'scripts/naxx_public_page.py')
public = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(public)


class InputTests(unittest.TestCase):
    def test_allowlist_rejects_paths_and_html_before_any_io(self):
        for theme in ('../naxx', '/tmp/file', 'naxx.html', 'https://example.com', '<html>', '', None, {}, 1):
            with self.subTest(theme=theme), self.assertRaises(public.PublicPageError) as error:
                public.PublicPageStore().execute('public_page_publish', theme)
            self.assertEqual(error.exception.status, 400)

    def test_action_and_request_are_allowlisted(self):
        for action in ('publish', 'public_page_delete', 'public_page_status;id', None):
            with self.assertRaises(public.PublicPageError):
                public.PublicPageStore().execute(action)
        for request in ({'path': '/etc/passwd'}, {'html': '<html>'}, {'command': 'id'}, ['naxx']):
            with self.assertRaises(public.PublicPageError):
                public.control_public_page('public_page_publish', request)


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'geteuid') and os.geteuid() == 0,
                     'Atomic descriptor/ownership fixtures require POSIX root; API guards run everywhere.')
class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='naxx-public-test-')
        self.base = Path(self.temporary.name)
        self.www, self.themes, self.runtime = (self.base / value for value in ('www', 'themes', 'state'))
        self.www.mkdir()
        self.themes.mkdir()
        self.original = b'<!doctype html><html><body>Welcome to nginx!</body></html>'
        self.target = self.www / 'index.html'
        self.target.write_bytes(self.original)
        self.target.chmod(0o550)
        for theme in public.THEME_IDS:
            (self.themes / (theme + '.html')).write_text('<!doctype html><html><body>' + theme + '</body></html>', encoding='utf-8')
        self.store = public.PublicPageStore(self.target, self.themes, self.runtime,
                                           hashlib.sha256(self.original).hexdigest())

    def tearDown(self):
        self.temporary.cleanup()

    def call(self, action='status', theme=None):
        return self.store.execute('public_page_' + action, theme)

    def test_status_and_preview_never_create_state_or_change_html(self):
        before = self.target.stat()
        self.assertEqual(self.call()['state']['selected'], 'original')
        self.assertEqual(self.call('preview', 'naxx')['preview']['theme'], 'naxx')
        self.assertFalse(self.runtime.exists())
        self.assertEqual(public.signature(before), public.signature(self.target.stat()))

    def test_publish_backup_idempotence_switch_and_restore(self):
        self.assertTrue(self.call('publish', 'naxx')['changed'])
        self.assertEqual((self.runtime / 'original.html').read_bytes(), self.original)
        backup = (self.runtime / 'original.html').stat()
        first = self.target.stat()
        self.assertFalse(self.call('publish', 'naxx')['changed'])
        self.assertEqual(public.signature(first), public.signature(self.target.stat()))
        self.assertEqual(self.call('publish', 'aurora')['state']['selected'], 'aurora')
        self.assertEqual(public.signature(backup), public.signature((self.runtime / 'original.html').stat()))
        self.assertTrue(self.call('restore')['changed'])
        self.assertEqual(self.target.read_bytes(), self.original)
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o550)
        self.assertFalse(self.call('restore')['changed'])

    def test_custom_page_and_foreign_change_are_preserved(self):
        for before_publish in (True, False):
            if not before_publish:
                self.target.write_bytes(self.original)
                self.call('publish', 'naxx')
            self.target.write_bytes(b'custom customer page')
            self.assertEqual(self.call()['state']['selected'], 'custom')
            self.assertFalse(self.call()['state']['can_publish'])
            for action in ('publish', 'restore'):
                with self.assertRaises(public.PublicPageError):
                    self.call(action, 'aurora' if action == 'publish' else None)
                self.assertEqual(self.target.read_bytes(), b'custom customer page')

    def test_symlink_target_theme_parent_and_backup_are_refused(self):
        outside = self.base / 'outside.html'
        outside.write_bytes(b'preserve outside')
        self.target.unlink()
        self.target.symlink_to(outside)
        with self.assertRaises((OSError, public.PublicPageError)):
            self.call('publish', 'naxx')
        self.assertEqual(outside.read_bytes(), b'preserve outside')
        self.target.unlink()
        self.target.write_bytes(self.original)
        template = self.themes / 'naxx.html'
        template.unlink()
        template.symlink_to(outside)
        with self.assertRaises((OSError, public.PublicPageError)):
            self.call('preview', 'naxx')
        template.unlink()
        template.write_text('<html>naxx</html>')
        self.call('publish', 'naxx')
        (self.runtime / 'original.html').unlink()
        (self.runtime / 'original.html').symlink_to(outside)
        with self.assertRaises((OSError, public.PublicPageError)):
            self.call('restore')
        self.assertEqual(outside.read_bytes(), b'preserve outside')
        self.www.rename(self.base / 'moved')
        self.www.symlink_to(self.base / 'moved', target_is_directory=True)
        with self.assertRaises((OSError, public.PublicPageError)):
            self.call('status')

    def test_atomic_failure_preserves_current_and_backup_then_retry_works(self):
        real_replace = public.os.replace
        def fail_public(source, target, **options):
            if target == 'index.html':
                raise OSError('simulated disk failure')
            return real_replace(source, target, **options)
        with mock.patch.object(public.os, 'replace', side_effect=fail_public):
            with self.assertRaises(OSError):
                self.call('publish', 'naxx')
        self.assertEqual(self.target.read_bytes(), self.original)
        self.assertEqual((self.runtime / 'original.html').read_bytes(), self.original)
        self.assertFalse(list(self.www.glob('.naxx-public-*')))
        self.assertTrue(self.call('publish', 'naxx')['changed'])

    def test_interrupted_initial_backup_is_recoverable_without_losing_original(self):
        real_replace = public.os.replace
        def fail_metadata(source, target, **options):
            if target == 'backup.json':
                raise OSError('simulated backup metadata failure')
            return real_replace(source, target, **options)
        with mock.patch.object(public.os, 'replace', side_effect=fail_metadata):
            with self.assertRaises(OSError):
                self.call('publish', 'naxx')
        self.assertEqual(self.target.read_bytes(), self.original)
        self.assertEqual((self.runtime / 'original.html').read_bytes(), self.original)
        self.assertEqual(self.call()['state']['selected'], 'original')
        self.assertTrue(self.call('publish', 'naxx')['changed'])
        self.assertEqual((self.runtime / 'original.html').read_bytes(), self.original)

    def test_concurrent_replacement_is_preserved(self):
        real_replace = public.replace_file
        def race(descriptor, name, *args, **options):
            if name == 'index.html':
                self.target.write_bytes(b'external replacement')
            return real_replace(descriptor, name, *args, **options)
        with mock.patch.object(public, 'replace_file', side_effect=race):
            with self.assertRaises(public.PublicPageError):
                self.call('publish', 'naxx')
        self.assertEqual(self.target.read_bytes(), b'external replacement')

    def test_competing_index_hardlink_size_permissions_and_template_updates(self):
        other = self.www / 'index.php'
        other.write_bytes(b'<?php protected')
        with self.assertRaises(public.PublicPageError):
            self.call('publish', 'naxx')
        other.unlink()
        os.link(self.target, self.www / 'linked')
        with self.assertRaises(public.PublicPageError):
            self.call()
        (self.www / 'linked').unlink()
        self.target.write_bytes(b'x' * (public.MAX_HTML + 1))
        with self.assertRaises(public.PublicPageError):
            self.call()
        self.target.write_bytes(self.original)
        self.target.chmod(0o666)
        with self.assertRaises(public.PublicPageError):
            self.call()
        self.target.chmod(0o550)
        self.call('publish', 'naxx')
        (self.themes / 'naxx.html').write_text('<html>new trusted version</html>')
        self.assertEqual(self.call()['state']['selected'], 'naxx')
        self.assertTrue(self.call('restore')['changed'])


@unittest.skipUnless(shutil.which('php'), 'Local PHP CLI required for endpoint fixtures.')
class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='naxx-public-api-')
        cls.base = Path(cls.temporary.name)
        # Isolate the endpoint too: valid CSRF fixtures must never reach an
        # installed production daemon when this suite runs on a real panel.
        endpoint = (ROOT / 'xui-naxx/src/public-page-api.php').read_text(encoding='utf-8')
        socket_literal = "'unix:///run/naxx-update/control.sock'"
        if socket_literal not in endpoint:
            raise RuntimeError('Review the API fixture socket isolation after changing its connection path.')
        fake_socket = 'unix://' + str(cls.base / 'absent-control.sock').replace('\\', '/')
        endpoint = endpoint.replace(socket_literal, "'" + fake_socket.replace("'", "\\'") + "'")
        (cls.base / 'api.php').write_text(endpoint, encoding='utf-8')
        (cls.base / 'settings.php').write_text('''<?php
if ($_GET || $_POST || $_REQUEST || $_SERVER['REQUEST_METHOD'] !== 'GET') throw new RuntimeException('untrusted parameters');
session_start();
$fixture = $_SERVER['HTTP_X_FIXTURE_ACCESS'] ?? 'admin';
if ($fixture === 'login') { header('Location: /login'); exit; }
if ($fixture === 'redirect') header('Location: /login');
$fixtureGroup = ['is_admin' => '1', 'is_reseller' => '0', 'group_id' => '1'];
if ($fixture === 'reseller') $fixtureGroup['is_reseller'] = '1';
if ($fixture === 'group') $fixtureGroup['group_id'] = '2';
if ($fixture === 'not-admin') $fixtureGroup['is_admin'] = '0';
if ($fixture === 'loose-enum') $fixtureGroup['group_id'] = '01';
if ($fixture === 'missing-group') unset($fixtureGroup);
if ($fixture === 'ambiguous') $otherGroup = ['is_admin' => '0', 'is_reseller' => '1', 'group_id' => '8'];
echo 'private native content', '<input id="server_name" name="server_name">';
session_write_close();
''', encoding='utf-8')
        (cls.base / 'router.php').write_text('''<?php
$untrustedBeforeBootstrap = ['is_admin' => '1', 'is_reseller' => '0', 'group_id' => '1'];
$_SESSION = $untrustedBeforeBootstrap;
require __DIR__ . '/api.php';
''', encoding='utf-8')
        with socket.socket() as candidate:
            candidate.bind(('127.0.0.1', 0))
            port = candidate.getsockname()[1]
        cls.url = 'http://127.0.0.1:' + str(port)
        cls.process = subprocess.Popen([shutil.which('php'), '-d', 'session.save_path=' + str(cls.base),
                                       '-d', 'log_errors=0', '-S', '127.0.0.1:' + str(port), str(cls.base / 'router.php')],
                                       cwd=str(cls.base), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        for _ in range(100):
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.1):
                    break
            except OSError:
                time.sleep(.03)
        else:
            cls.process.terminate()
            raise RuntimeError('PHP fixture did not start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)
        cls.temporary.cleanup()

    def request(self, body=None, method=None, query='', headers=None):
        actual = {'X-Requested-With': 'XMLHttpRequest', 'Origin': self.url, 'Content-Type': 'application/json'}
        actual.update(headers or {})
        data = json.dumps(body).encode() if body is not None and not isinstance(body, bytes) else body
        request = urllib.request.Request(self.url + '/endpoint?feature=public-page' + query, data=data,
                                         headers=actual, method=method or ('POST' if data is not None else 'GET'))
        try:
            response = self.opener.open(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read().decode()
        self.assertNotIn('private native content', raw)
        self.assertIn('application/json', response.headers.get('Content-Type', ''))
        return response.status, json.loads(raw)

    def test_native_admin_group_is_required(self):
        for access in ('login', 'redirect', 'reseller', 'group', 'not-admin', 'loose-enum', 'missing-group', 'ambiguous'):
            with self.subTest(access=access):
                self.assertEqual(self.request(headers={'X-Fixture-Access': access})[0], 403)

    def test_status_get_and_preview_have_no_write_action(self):
        status, payload = self.request(query='&action=publish&theme=naxx')
        self.assertEqual(status, 503)  # fixture has no privileged socket
        self.assertEqual(len(payload['csrf']), 64)
        self.assertTrue(payload['service_unavailable'])
        self.assertEqual(self.request(query='&preview=../naxx')[0], 400)
        self.assertEqual(self.request(query='&preview[]=naxx')[0], 400)
        self.assertEqual(self.request(query='&preview=naxx')[0], 503)

    def test_origin_ajax_methods_and_content_type_are_guarded(self):
        self.assertEqual(self.request(headers={'X-Requested-With': ''})[0], 403)
        self.assertEqual(self.request(headers={'Origin': 'https://other.example'})[0], 403)
        self.assertEqual(self.request(headers={'Sec-Fetch-Site': 'cross-site'})[0], 403)
        self.assertEqual(self.request(method='DELETE')[0], 405)
        self.assertEqual(self.request({'action': 'publish'}, headers={'Content-Type': 'text/plain'})[0], 400)
        self.assertEqual(self.request({'action': 'publish'}, headers={'Origin': ''})[0], 403)

    def test_csrf_and_strict_input_precede_privileged_socket(self):
        _, response = self.request()
        token = response['csrf']
        self.assertEqual(self.request({'action': 'publish', 'theme': 'naxx', 'csrf': 'x' * 64})[0], 403)
        self.assertEqual(self.request({'action': 'publish', 'theme': 'naxx', 'csrf': token})[0], 503)
        self.assertEqual(self.request({'action': 'restore', 'csrf': token})[0], 503)
        for body in ({'action': 'status', 'csrf': token}, {'action': 'publish', 'theme': '../file', 'csrf': token},
                     {'action': 'publish', 'theme': 'naxx', 'csrf': token, 'html': '<html>'},
                     {'action': 'restore', 'theme': 'naxx', 'csrf': token}):
            self.assertEqual(self.request(body)[0], 400)
        self.assertEqual(self.request(b'{' + b' ' * 2048)[0], 400)


if __name__ == '__main__':
    unittest.main(verbosity=2)
