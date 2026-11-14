#!/usr/bin/env python3
"""Instala o serviço de atualizações Xui Naxx preservando sua configuração."""
import argparse
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
LIBRARY = Path('/usr/local/lib/naxx')
UNITS = Path('/etc/systemd/system')
RUNTIME = Path('/var/lib/naxx-updates')
FILES = ('naxx_update.py', 'naxx_public_page.py', 'naxx-update.service', 'naxx-update-check.service', 'naxx-update.timer')


THEME_FILES = ('naxx.html', 'aurora.html', 'claro.html', 'cinema.html', 'catalog.json')
THEME_SOURCE = HERE.parent / 'xui-naxx/src/public-themes'
THEME_TARGET = Path('/usr/local/lib/naxx-public-page/themes')
PUBLIC_RUNTIME = Path('/var/lib/naxx-public-page')


def checked_path(path, trusted=False):
    # Inspect each existing component before creating files or changing services.
    path = Path(path).absolute()
    for component in reversed((path, *path.parents)):
        if component.is_symlink():
            raise RuntimeError('Caminho simbólico recusado: ' + str(component))
        if component.exists():
            info = component.stat()
            if trusted and (info.st_uid != 0 or info.st_mode & 0o022):
                raise RuntimeError('O destino deve pertencer ao root sem escrita por terceiros: ' + str(component))


def public_page_sources():
    sources = {}
    for filename in THEME_FILES:
        source = THEME_SOURCE / filename
        checked_path(source)
        if not source.is_file() or source.stat().st_nlink != 1:
            raise RuntimeError('Modelo público ausente ou inválido: ' + filename)
        data = source.read_bytes()
        if not data or len(data) > 128 * 1024:
            raise RuntimeError('Tamanho do modelo público inválido: ' + filename)
        text = data.decode('utf-8')
        if filename == 'catalog.json':
            catalog = json.loads(text)
            if (not isinstance(catalog, list) or len(catalog) != 4 or
                    any(not isinstance(item, dict) for item in catalog) or
                    [item.get('id') for item in catalog] != ['naxx', 'aurora', 'claro', 'cinema'] or
                    any(item.get('file') != item['id'] + '.html' for item in catalog)):
                raise RuntimeError('Catálogo de modelos inválido.')
        elif '<?' in text or '<html' not in text.lower() or '</html>' not in text.lower():
            raise RuntimeError('O modelo público precisa ser HTML estático: ' + filename)
        sources[filename] = source
        checked_path(THEME_TARGET / filename, trusted=True)
    checked_path(PUBLIC_RUNTIME, trusted=True)
    if PUBLIC_RUNTIME.exists() and (not PUBLIC_RUNTIME.is_dir() or PUBLIC_RUNTIME.stat().st_mode & 0o077):
        raise RuntimeError('O backup da página pública deve ter acesso restrito ao root.')
    return sources


def install_public_pages(sources):
    for directory, mode in ((THEME_TARGET.parent, 0o755), (THEME_TARGET, 0o755), (PUBLIC_RUNTIME, 0o700)):
        directory.mkdir(parents=True, exist_ok=True)
        os.chown(directory, 0, 0)
        directory.chmod(mode)
    changed = False
    for filename, source in sources.items():
        changed = replace_if_changed(source, THEME_TARGET / filename, 0o644) or changed
    return changed


def run(*command):
    return subprocess.run(list(map(str, command)), check=True)


def replace_if_changed(source, target, mode):
    data = source.read_bytes()
    if target.is_symlink():
        raise RuntimeError('Destino simbólico recusado: ' + str(target))
    if target.is_file() and target.read_bytes() == data and target.stat().st_uid == 0 and target.stat().st_gid == 0 and target.stat().st_mode & 0o777 == mode:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix='.naxx-update-', dir=str(target.parent))
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            os.fchown(output.fileno(), 0, 0)
            os.fchmod(output.fileno(), mode)
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(target)
    finally:
        if temporary.exists():
            temporary.unlink()
    return True


def install():
    if platform.system() != 'Linux' or os.geteuid() != 0:
        raise RuntimeError('Execute no servidor Linux como root: sudo python3 scripts/instalar_atualizador.py --install')
    for filename in FILES:
        source = HERE / filename
        checked_path(source)
        checked_path(LIBRARY / filename if filename.endswith('.py') else UNITS / filename, trusted=True)
        if source.is_symlink() or not source.is_file():
            raise RuntimeError('Arquivo do atualizador ausente ou inválido: ' + filename)
    sources = public_page_sources()
    configuration = RUNTIME / 'config.json'
    checked_path(configuration, trusted=True)
    checked_path(RUNTIME / 'state.json', trusted=True)
    active = subprocess.run(['systemctl', 'is-active', '--quiet', 'naxx-update.service']).returncode == 0
    state_path = RUNTIME / 'state.json'
    if active and state_path.is_file():
        state = json.loads(state_path.read_text(encoding='utf-8'))
        if not isinstance(state, dict) or state.get('busy'):
            raise RuntimeError('Aguarde a conclusão da atualização em andamento antes de atualizar o serviço.')
    changed = install_public_pages(sources)
    for filename in FILES:
        target = LIBRARY / filename if filename.endswith('.py') else UNITS / filename
        changed = replace_if_changed(HERE / filename, target, 0o750 if filename.endswith('.py') else 0o644) or changed
    configuration = RUNTIME / 'config.json'
    if configuration.is_symlink():
        raise RuntimeError('Configuração simbólica recusada.')
    if not configuration.exists():
        run(sys.executable, LIBRARY / 'naxx_update.py', '--initialize', '--enable-automatic')
    else:
        print('Configuração e preferência de atualização automática preservadas.', flush=True)
    run('systemctl', 'daemon-reload')
    if active and changed:
        run('systemctl', 'restart', 'naxx-update.service')
    run('systemctl', 'enable', '--now', 'naxx-update.service', 'naxx-update.timer')
    print('Serviço de atualização Xui Naxx instalado. Acesse Atualização no menu do perfil.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install', action='store_true', required=True)
    parser.parse_args()
    install()


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit('Instalação do atualizador interrompida: ' + str(error))
