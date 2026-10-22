#!/usr/bin/env python3
"""Entrada reproduzível da edição NAXX, com pacote fixado por SHA-256."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile

REPO = Path(__file__).resolve().parent.parent
EDITION = '1.5.14'
TAG = 'v' + EDITION
ASSET = 'XUI-NAXX-COMPLETO.zip'
PATCH_FILES = ('xui.so', 'license', 'manifest.json')
EXTRACTION = ('xui.tar.gz',) + tuple('scripts/community-patch/' + name for name in PATCH_FILES)
UPSTREAM = 'https://github.com/amidevous/xui.one/releases/download/test/'
CORE_ZIP_HASH = 'f88bfcd81552432d4858d0a6395eea02dd191151371ea51745a86b919b31003f'
CORE_TAR_HASH = 'c5c0668194b75bd35ff391ee82cf42793eb26ef8043f4cbadb6c99666c3e328f'
PATCH_ARCHIVE_HASH = 'a2ee18c9f12175f9dff5a2243b2f4656c9abe20ae0c5864074cc3a0d559f0d98'
PATCH_HASHES = {
    'xui.so': '04f69edb87102ec6710dd1b0274ae0fc557c5eb7389434558600d54ad91d5b19',
    'license': '2f722718511b51ea1a621dfd91a225ee939b52b9682e16e495a434188e829327',
}


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def expected_hash():
    manifest = REPO / 'releases' / TAG / 'SHA256SUMS'
    rows = [line.split() for line in manifest.read_text(encoding='utf-8').splitlines() if line.strip()]
    matches = [row[0] for row in rows if len(row) == 2 and row[1].lstrip('*') == ASSET]
    if len(matches) != 1 or len(matches[0]) != 64 or any(c not in '0123456789abcdef' for c in matches[0]):
        raise RuntimeError('SHA256SUMS ausente ou inválido para a release fixada ' + TAG + '.')
    return matches[0]


def obtain_bundle(given):
    expected = expected_hash()
    bundle = given.expanduser().resolve()
    if not bundle.is_file():
        raise RuntimeError('Pacote informado não encontrado: ' + str(bundle))
    print('Conferindo integridade do pacote ' + TAG + '...', flush=True)
    if digest(bundle) != expected:
        raise RuntimeError('O SHA-256 do pacote não confere com este commit. O arquivo não foi extraído.')
    return bundle


def extract_selected(bundle, destination, names=EXTRACTION):
    """Extrai somente os nomes conhecidos, nunca os caminhos de um ZIP arbitrário."""
    destination = destination.resolve()
    with zipfile.ZipFile(bundle) as archive:
        entries = archive.infolist()
        for relative in names:
            matches = [entry for entry in entries if entry.filename == relative or (relative.startswith('scripts/community-patch/') and entry.filename.endswith('/community-patch/' + relative.rsplit('/', 1)[-1]))]
            if len(matches) != 1:
                raise RuntimeError('Entrada ausente ou repetida no pacote: ' + relative)
            info = matches[0]
            mode = info.external_attr >> 16
            kind = stat.S_IFMT(mode)
            if info.is_dir() or kind not in (0, stat.S_IFREG):
                raise RuntimeError('Entrada não regular recusada no pacote: ' + relative)
            path = PurePosixPath(relative)
            if path.is_absolute() or '..' in path.parts or '\\' in relative:
                raise RuntimeError('Caminho inválido no pacote.')
            target = destination.joinpath(*path.parts)
            if target.is_symlink():
                raise RuntimeError('Destino simbólico recusado: ' + relative)
            try:
                target.resolve().relative_to(destination)
            except ValueError:
                raise RuntimeError('Destino fora da preparação do pacote.')
            target.parent.mkdir(parents=True, exist_ok=True)
            fd, temporary_name = tempfile.mkstemp(prefix='.naxx-', dir=str(target.parent))
            temporary = Path(temporary_name)
            try:
                with os.fdopen(fd, 'wb') as output, archive.open(info) as source:
                    shutil.copyfileobj(source, output, length=1024 * 1024)
                    output.flush()
                    os.fsync(output.fileno())
                temporary.chmod(0o600)
                temporary.replace(target)
            finally:
                if temporary.exists():
                    temporary.unlink()


def download_verified(filename, expected):
    cache = REPO / '.painelnax-cache' / 'upstream'
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / filename
    if path.is_file() and digest(path) == expected:
        return path
    url = UPSTREAM + filename
    print('Baixando componente original verificado: ' + filename + '...', flush=True)
    fd, temporary_name = tempfile.mkstemp(prefix='.download-', dir=str(cache))
    temporary = Path(temporary_name)
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'PAINELNAX/1.5.14'})
        with os.fdopen(fd, 'wb') as output, urllib.request.urlopen(request, timeout=120) as source:
            if not source.geturl().startswith('https://'):
                raise RuntimeError('Redirecionamento sem HTTPS recusado.')
            shutil.copyfileobj(source, output, length=1024 * 1024)
            output.flush()
            os.fsync(output.fileno())
        if digest(temporary) != expected:
            raise RuntimeError('O hash do componente original não confere: ' + filename)
        temporary.replace(path)
        return path
    finally:
        if temporary.exists():
            temporary.unlink()


def prepare_components(destination, bundle=None):
    if bundle:
        extract_selected(obtain_bundle(bundle), destination)
    else:
        core = download_verified('XUI_1.5.12.zip', CORE_ZIP_HASH)
        extract_selected(core, destination, names=('xui.tar.gz',))
        correction = download_verified('xui_crack.tar.gz', PATCH_ARCHIVE_HASH)
        patch = destination / 'scripts/community-patch'
        try:
            patch.resolve().relative_to(destination.resolve())
        except ValueError:
            raise RuntimeError('Destino comunitário fora da preparação do pacote.')
        if patch.is_symlink():
            raise RuntimeError('Destino comunitário simbólico recusado.')
        patch.mkdir(parents=True, exist_ok=True)
        with tarfile.open(correction, 'r:gz') as archive:
            members = archive.getmembers()
            for filename, expected in PATCH_HASHES.items():
                matches = [item for item in members if item.name == './' + filename or item.name == filename]
                if len(matches) != 1 or not matches[0].isfile():
                    raise RuntimeError('Componente comunitário não regular ou repetido: ' + filename)
                with archive.extractfile(matches[0]) as source:
                    content = source.read()
                if hashlib.sha256(content).hexdigest() != expected:
                    raise RuntimeError('Hash comunitário divergente: ' + filename)
                target = patch / filename
                if target.is_symlink():
                    raise RuntimeError('Destino comunitário simbólico recusado.')
                target.write_bytes(content)
                target.chmod(0o600)
        manifest = dict(PATCH_HASHES, source=UPSTREAM + 'xui_crack.tar.gz', archive_sha256=PATCH_ARCHIVE_HASH)
        (patch / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    if digest(destination / 'xui.tar.gz') != CORE_TAR_HASH:
        raise RuntimeError('O núcleo extraído não corresponde à base original fixada.')
    for filename, expected in PATCH_HASHES.items():
        if digest(destination / 'scripts/community-patch' / filename) != expected:
            raise RuntimeError('O componente comunitário extraído não confere: ' + filename)


def run_script(path, *arguments):
    subprocess.run([sys.executable, str(path), *map(str, arguments)], check=True)


def require_root():
    if platform.system() != 'Linux' or os.geteuid() != 0:
        raise RuntimeError('A instalação do painel deve ser executada no Linux como root: sudo ./install.sh')


def validate_new_server():
    release = {}
    for line in Path('/etc/os-release').read_text().splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            release[key] = value.strip('"')
    if release.get('ID') != 'ubuntu' or release.get('VERSION_ID') != '20.04' or platform.machine() != 'x86_64':
        raise RuntimeError('A instalação completa exige Ubuntu 20.04 x86_64 em um servidor novo.')


def install_new(bundle):
    # A preparação pertence ao instalador deste servidor.
    stage = Path('/var/lib/xui-naxx/install')
    if stage.is_symlink():
        raise RuntimeError('Diretório de preparação simbólico recusado.')
    marker = stage / '.painelnax-stage'
    if stage.exists() and any(stage.iterdir()) and not marker.is_file():
        raise RuntimeError('O diretório /var/lib/xui-naxx/install já contém dados. Use os scripts da instalação que o criou.')
    stage.mkdir(parents=True, mode=0o700, exist_ok=True)
    stage.chmod(0o700)
    marker.write_text('Xui Naxx ' + EDITION + '\n', encoding='utf-8')
    marker.chmod(0o600)
    data = stage / 'release-data'
    prepare_components(data, bundle)
    original = stage / 'original'
    original.mkdir(exist_ok=True)
    shutil.copyfile(data / 'xui.tar.gz', original / 'xui.tar.gz')
    shutil.copyfile(REPO / 'xui-original/install', original / 'install')
    manifest = {name: digest(original / name) for name in ('xui.tar.gz', 'install')}
    (original / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    (stage / 'scripts').mkdir(exist_ok=True)
    for filename in ('instalar_base.py', 'aplicar_componentes.py', 'atualizar_banco.py', 'naxx-maintenance.service'):
        shutil.copyfile(REPO / 'scripts' / filename, stage / 'scripts' / filename)
    (stage / 'patch').mkdir(exist_ok=True)
    for filename in PATCH_FILES:
        shutil.copyfile(data / 'scripts/community-patch' / filename, stage / 'patch' / filename)
    shutil.copytree(REPO / 'xui-naxx/atualizacao', stage / 'atualizacao', dirs_exist_ok=True)
    run_script(stage / 'scripts/instalar_base.py')
    run_script(stage / 'scripts/aplicar_componentes.py')
    run_script(stage / 'scripts/atualizar_banco.py', '--install')
    run_script(REPO / 'scripts/instalar_atualizador.py', '--install')
    run_script(REPO / 'scripts/otimizar_sistema.py', '--apply')
    run_script(REPO / 'scripts/otimizar_http.py', '--apply')
    progress = json.loads((stage / 'installation-progress.json').read_text())
    code = progress.get('access_code')
    if code:
        print('Acesso local ao servidor: http://127.0.0.1/' + code + '/')
    print('Instalação concluída. Acesse o painel e finalize o cadastro do administrador pelo setup.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, help='ZIP completo da release v1.5.14 já baixado')
    parser.add_argument('--check', action='store_true', help='Conferir ambiente e compatibilidade sem instalar')
    parser.add_argument('--prepare-only', action='store_true', help='Preparar os componentes verificados sem instalar o painel')
    args = parser.parse_args()
    if args.prepare_only:
        prepare_components(REPO, args.bundle)
        print('Componentes verificados preparados. Execute sudo ./install.sh no servidor para instalar.')
        return
    require_root()
    os.umask(0o077)
    if Path('/home/xui').exists():
        if not Path('/home/xui/status').is_file():
            raise RuntimeError('/home/xui existe, mas não parece conter o painel esperado.')
        if args.check:
            run_script(REPO / 'xui-naxx/atualizacao/aplicar.py', '--check')
            run_script(REPO / 'scripts/otimizar_sistema.py', '--check')
            run_script(REPO / 'scripts/otimizar_http.py', '--check')
            return
        print('Instalação existente: aplicando interface NAXX e manutenção automática.', flush=True)
        run_script(REPO / 'xui-naxx/atualizacao/aplicar.py')
        run_script(REPO / 'scripts/atualizar_banco.py', '--install')
        run_script(REPO / 'scripts/instalar_atualizador.py', '--install')
        run_script(REPO / 'scripts/otimizar_sistema.py', '--apply')
        run_script(REPO / 'scripts/otimizar_http.py', '--apply')
        print('Atualização NAXX aplicada.')
        return
    validate_new_server()
    if args.check:
        if shutil.disk_usage('/').free < 5 * 1024 ** 3:
            raise RuntimeError('São necessários pelo menos 5 GB livres para preparar a instalação.')
        print('Ubuntu 20.04 x86_64 e espaço livre conferidos. Nenhum componente foi instalado.')
        return
    install_new(args.bundle)


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        print('Instalação interrompida: ' + str(error), file=sys.stderr)
        sys.exit(1)
