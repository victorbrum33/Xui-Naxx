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
FILES = ('naxx_update.py', 'naxx-update.service', 'naxx-update-check.service', 'naxx-update.timer')


def run(*command):
    return subprocess.run(list(map(str, command)), check=True)


def replace_if_changed(source, target, mode):
    data = source.read_bytes()
    if target.is_symlink():
        raise RuntimeError('Destino simbólico recusado: ' + str(target))
    if target.is_file() and target.read_bytes() == data:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix='.naxx-update-', dir=str(target.parent))
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, 'wb') as output:
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
        if source.is_symlink() or not source.is_file():
            raise RuntimeError('Arquivo do atualizador ausente ou inválido: ' + filename)
    active = subprocess.run(['systemctl', 'is-active', '--quiet', 'naxx-update.service']).returncode == 0
    state_path = RUNTIME / 'state.json'
    if active and state_path.is_file():
        state = json.loads(state_path.read_text(encoding='utf-8'))
        if not isinstance(state, dict) or state.get('busy'):
            raise RuntimeError('Aguarde a conclusão da atualização em andamento antes de atualizar o serviço.')
    changed = False
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
