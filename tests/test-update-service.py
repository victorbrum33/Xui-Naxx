"""Testes offline do atualizador; executar no Linux contra a cópia do módulo."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import threading
import time
import zipfile

source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parents[1] / 'scripts/naxx_update.py'
spec = importlib.util.spec_from_file_location('naxx_update', source)
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def expect_error(function, message):
    try:
        function()
    except (updater.UpdateError, OSError):
        return
    raise AssertionError(message)


def package(files, extra=None, symlink=False):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path, data in files.items():
            info = zipfile.ZipInfo('payload/' + path)
            info.external_attr = (stat.S_IFLNK | 0o777 if symlink else stat.S_IFREG | 0o644) << 16
            archive.writestr(info, data)
        if extra:
            archive.writestr(extra, b'outside')
    blob = output.getvalue()
    manifest = {'schema': 1, 'name': 'Xui Naxx Frontend', 'version': '1.5.15', 'published_at': '2026-10-21T00:00:00Z', 'archive': {'url': 'https://raw.githubusercontent.com/' + updater.REPOSITORY + '/' + 'a' * 40 + '/naxx-frontend.zip', 'size': len(blob), 'sha256': sha(blob)}, 'files': [{'path': path, 'size': len(data), 'sha256': sha(data)} for path, data in files.items()]}
    return blob, manifest


with tempfile.TemporaryDirectory(prefix='naxx-update-test-') as temporary:
    base = Path(temporary)
    root, runtime = base / 'panel', base / 'state'
    root.mkdir()
    runtime.mkdir(mode=0o700)
    javascript = 'admin/assets/js/naxx-overlay.js'
    stylesheet = 'admin/assets/css/naxx-overlay.css'
    api = 'admin/naxx-update.php'
    (root / javascript).parent.mkdir(parents=True)
    (root / javascript).write_bytes(b'old javascript')
    updater.atomic_json(runtime / 'config.json', {'root': str(root), 'owner_uid': os.getuid(), 'owner_gid': os.getgid(), 'repository': updater.REPOSITORY, 'automatic': True})
    updater.atomic_json(runtime / 'installed.json', {'version': '1.5.14', 'files': {javascript: sha(b'old javascript')}, 'archive_sha256': None, 'last_backup': None})
    manager = updater.Manager(runtime)
    contents = {javascript: b'new javascript', stylesheet: b'new style', api: b'<?php echo "own API";'}
    archive, manifest = package(contents)

    def fake_download(url, kind, limit):
        updater.allowed_url(url, kind)
        if kind == 'repository':
            return json.dumps({'private': False, 'full_name': updater.REPOSITORY}).encode()
        if kind == 'manifest':
            return json.dumps(manifest).encode()
        return archive
    updater.download = fake_download

    # Falha depois do primeiro arquivo deve restaurar todos os originais.
    original_replace = manager.replace_target
    writes = [0]
    def fail_once(path, data, *args, **kwargs):
        writes[0] += 1
        if writes[0] == 2:
            raise OSError('falha de escrita simulada')
        return original_replace(path, data, *args, **kwargs)
    manager.replace_target = fail_once
    expect_error(manager.install, 'Uma falha de escrita precisa recusar a atualização.')
    assert (root / javascript).read_bytes() == b'old javascript'
    assert not (root / stylesheet).exists() and not (root / api).exists()
    assert manager.installed['version'] == '1.5.14'
    manager.replace_target = original_replace

    manager.install()
    assert manager.installed['version'] == '1.5.15'
    for path, data in contents.items():
        assert (root / path).read_bytes() == data
    assert manager.snapshot()['canRollback']
    assert manager.latest()[1] is False

    # Falha durante rollback precisa recolocar a versão nova integralmente.
    original_restore = manager.restore_record
    restores = [0]
    def fail_restore_once(backup, record, before=True):
        if before:
            restores[0] += 1
            if restores[0] == 2:
                raise OSError('falha de restauração simulada')
        return original_restore(backup, record, before)
    manager.restore_record = fail_restore_once
    expect_error(manager.rollback, 'Falha de rollback deve ser reportada.')
    for path, data in contents.items():
        assert (root / path).read_bytes() == data
    manager.restore_record = original_restore
    manager.rollback()
    assert (root / javascript).read_bytes() == b'old javascript'
    assert not (root / stylesheet).exists() and not (root / api).exists()
    assert manager.installed['version'] == '1.5.14' and not manager.config['automatic']

    # Canal compatível com validadores legados, edição completa nos novos serviços.
    assert updater.version_key('1.5.14') == updater.version_key('1.5.14.0')
    assert updater.version_key('1.5.14') < updater.version_key('1.5.14.1') < updater.version_key('1.5.15')
    bridge = json.loads(json.dumps(manifest))
    bridge.update(version='1.5.14', release_version='1.5.14.1')
    assert updater.manifest_version(updater.validate_manifest(bridge)) == '1.5.14.1'
    direct = json.loads(json.dumps(bridge))
    direct['version'] = '1.5.14.1'
    assert updater.manifest_version(updater.validate_manifest(direct)) == '1.5.14.1'
    for invalid in ['1.5.14.1.2', '1.5.-1', '1.5', '1.5.14.x']:
        expect_error(lambda: updater.version_key(invalid), 'Versão malformada precisa ser recusada.')
    for invalid in ['1.5.15.1', '1.5.13.9', True]:
        broken = json.loads(json.dumps(bridge)); broken['release_version'] = invalid
        expect_error(lambda: updater.validate_manifest(broken), 'Edição incompatível precisa ser recusada.')
    manifest = bridge
    manager.install()
    assert manager.installed['version'] == '1.5.14.1'
    assert manager.snapshot()['history'][0]['version'] == '1.5.14.1'
    assert manager.latest()[1] is False
    manager.installed['version'] = '1.5.14'
    updater.atomic_json(runtime / 'installed.json', manager.installed)
    assert manager.latest()[1] is False
    assert manager.installed['version'] == '1.5.14.1'
    manager.rollback()
    assert manager.installed['version'] == '1.5.14'
    manifest = json.loads(json.dumps(bridge)); manifest.pop('release_version'); manifest['version'] = '1.5.15'

    (root / javascript).write_bytes(b'manual change')
    expect_error(manager.install, 'Uma alteração manual precisa ser preservada.')
    assert (root / javascript).read_bytes() == b'manual change'
    (root / javascript).write_bytes(b'old javascript')

    # ZIP/manifestos não podem escapar da lista fixa ou conter links.
    for extra, link in [('payload/../../outside', False), (None, True)]:
        bad_archive, bad_manifest = package(contents, extra, link)
        with tempfile.TemporaryDirectory(dir=runtime) as stage:
            expect_error(lambda: manager.unpack(bad_manifest, bad_archive, Path(stage)), 'Um ZIP inseguro precisa ser recusado.')
    bad_manifest = json.loads(json.dumps(manifest))
    bad_manifest['files'][0]['path'] = 'admin/settings.php'
    expect_error(lambda: updater.validate_manifest(bad_manifest), 'O núcleo original não pode ser atualizado.')
    for url in ['http://raw.githubusercontent.com/' + updater.REPOSITORY + '/main/latest.json', 'https://127.0.0.1/a.zip', 'https://raw.githubusercontent.com/outro/repo/' + 'a' * 40 + '/naxx-frontend.zip', 'https://raw.githubusercontent.com/' + updater.REPOSITORY + '/main/naxx-frontend.zip', 'https://raw.githubusercontent.com:444/' + updater.REPOSITORY + '/' + 'a' * 40 + '/naxx-frontend.zip']:
        expect_error(lambda: updater.allowed_url(url, 'archive'), 'Uma origem/branch não permitida precisa ser recusada.')
    expect_error(lambda: updater.strict_json(b'{"schema":1,"schema":2}'), 'Chaves JSON repetidas precisam ser recusadas.')

    # Os diretórios são abertos com O_NOFOLLOW, inclusive para a escrita root.
    outside = base / 'outside'
    outside.mkdir()
    (outside / 'naxx-overlay.js').write_bytes(b'do not change')
    js_directory = (root / javascript).parent
    js_directory.rename(js_directory.with_name('js-original'))
    js_directory.symlink_to(outside, target_is_directory=True)
    expect_error(lambda: manager.read_target(javascript), 'Não pode ler por um diretório simbólico.')
    expect_error(lambda: manager.replace_target(javascript, b'unsafe'), 'Não pode gravar por um diretório simbólico.')
    assert (outside / 'naxx-overlay.js').read_bytes() == b'do not change'
    js_directory.unlink()
    js_directory.with_name('js-original').rename(js_directory)

    # Apenas um trabalho é aceito; status continua disponível durante o job.
    entered, finish = threading.Event(), threading.Event()
    def slow_latest():
        entered.set()
        finish.wait(2)
    manager.latest = slow_latest
    manager.dispatch({'action': 'check'}, os.getuid())
    assert entered.wait(1) and manager.snapshot()['busy']
    expect_error(lambda: manager.dispatch({'action': 'install'}, os.getuid()), 'Trabalhos simultâneos precisam ser recusados.')
    finish.set()
    for _ in range(100):
        if not manager.snapshot()['busy']:
            break
        time.sleep(0.01)
    assert not manager.snapshot()['busy']

print('OK: atualização/restauração atômicas, falhas de escrita, mudanças manuais, ZIP/SHA/allowlist, links, URLs públicas e lock.')
