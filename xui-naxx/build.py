"""Gera a atualização sem modificar os arquivos extraídos do pacote original."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

HERE = Path(__file__).resolve().parent
ORIGINAL = HERE.parent / 'xui-original'
PAYLOAD = HERE / 'atualizacao' / 'arquivos'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def build():
    translations = {}
    for source in ('pt-BR.tsv', 'permissions-pt-BR.tsv'):
        for line in (HERE / 'src' / source).read_text(encoding='utf-8').splitlines():
            key, value = line.split('\t', 1)
            if key in translations:
                raise ValueError(f'Chave repetida: {key}')
            translations[key] = value
    source_ini = (ORIGINAL / 'includes/langs/en.ini').read_text(encoding='utf-8')
    keys = re.findall(r'^([^\s=]+)\s*=\s*"', source_ini, re.M)
    missing = set(keys) - translations.keys()
    extra = translations.keys() - set(keys)
    if missing or extra:
        raise ValueError(f'Faltantes: {sorted(missing)}; extras: {sorted(extra)}')
    def quote(value):
        return value.replace('\\', '\\\\').replace('"', '\\"')
    translated = '[Language]\n' + '\n'.join(f'{key} = "{quote(translations[key])}"' for key in keys) + '\n'
    for key in keys:
        original_line = next(line for line in source_ini.splitlines() if line.startswith(key + ' ='))
        if re.findall(r'\{\w+\}|%[sd]', original_line) != re.findall(r'\{\w+\}|%[sd]', translations[key]):
            raise ValueError(f'Placeholder alterado: {key}')
    css = (HERE / 'src/naxx.css').read_text(encoding='utf-8')
    js = (HERE / 'src/naxx.js').read_text(encoding='utf-8')
    settings_translations = {}
    for line in (HERE / 'src/settings-pt-BR.tsv').read_text(encoding='utf-8').splitlines():
        key, value = line.split('\t', 1)
        if key in settings_translations:
            raise ValueError(f'Texto de configuração repetido: {key}')
        settings_translations[key] = value
    js = js.replace('/* NAXX_SETTINGS_TRANSLATIONS */', 'Object.assign(translations,' + json.dumps(settings_translations, ensure_ascii=False) + ');')
    settings_help_translations = {}
    for line in (HERE / 'src/settings-help-pt-BR.tsv').read_text(encoding='utf-8').splitlines():
        key, value = line.split('\t', 1)
        if key in settings_help_translations:
            raise ValueError(f'Ajuda de configuração repetida: {key}')
        settings_help_translations[key] = value
    js = js.replace('/* NAXX_SETTINGS_HELP_TRANSLATIONS */', 'Object.assign(settingsHelpTranslations,' + json.dumps(settings_help_translations, ensure_ascii=False) + ');')
    manifest = {'name': 'XUI NAXX', 'version': '1.5.14', 'base_version': '1.5.12', 'language_keys': len(keys), 'files': []}
    files = {
        'includes/langs/en.ini': translated,
        'includes/langs/pt_br.ini': translated,
    }
    files['admin/naxx-importador.html'] = (HERE / 'src/naxx-importador.html').read_text(encoding='utf-8')
    files['admin/naxx-importador.php'] = (HERE / 'src/naxx-importador.php').read_text(encoding='utf-8')
    files['admin/assets/js/naxx-native-importer.js'] = (HERE / 'src/native-importer.js').read_text(encoding='utf-8')
    files['admin/assets/css/naxx-importer.css'] = (HERE / 'src/importer.css').read_text(encoding='utf-8')
    for source in ('importer.js', 'importer-ui.js', 'importer-worker.js'):
        files['admin/assets/js/naxx-' + source] = (HERE / 'src' / source).read_text(encoding='utf-8')
    # Cada mudança recebe uma URL nova para evitar assets antigos em cache.
    worker_key = 'admin/assets/js/naxx-importer-worker.js'
    files[worker_key] = files[worker_key].replace('importer.js?v=1.5.14-4', 'importer.js?v=' + sha(files['admin/assets/js/naxx-importer.js'].encode())[:12])
    native_key = 'admin/assets/js/naxx-native-importer.js'
    files[native_key] = files[native_key].replace('naxx-importer-worker.js?v=1.5.14-4', 'naxx-importer-worker.js?v=' + sha(files[worker_key].encode())[:12])
    for relative in ('assets/css/naxx-importer.css', 'assets/js/naxx-importer.js', 'assets/js/naxx-importer-ui.js', 'assets/js/naxx-native-importer.js'):
        files['admin/naxx-importador.php'] = files['admin/naxx-importador.php'].replace(relative + '?v=1.5.14-4', relative + '?v=' + sha(files['admin/' + relative].encode())[:12])
    for name in ('app.css', 'app.dark.css'):
        original = (ORIGINAL / 'admin/assets/css' / name).read_text(encoding='utf-8')
        original = re.sub(r'^@import url\(https://fonts.googleapis.com[^\n]+\n', '', original)
        files['admin/assets/css/' + name] = original + '\n' + css + ('\n' + (HERE / 'src/naxx-light.css').read_text(encoding='utf-8') if name == 'app.css' else '')
    original_js = (ORIGINAL / 'admin/assets/js/app.min.js').read_text(encoding='utf-8')
    original_js = original_js.replace('    $("#basicwizard").bootstrapWizard()', '    if ($.fn.bootstrapWizard) { $("#basicwizard").bootstrapWizard()').replace('    $("#basicTree").jstree({', '    }\n    if ($.fn.jstree) { $("#basicTree").jstree({').replace('plugins: ["contextmenu", "dnd", "search", "state", "types", "wholerow"]\n    })', 'plugins: ["contextmenu", "dnd", "search", "state", "types", "wholerow"]\n    }) }')
    files['admin/assets/js/app.min.js'] = js + '\n' + (HERE / 'src/cleanup-tools.js').read_text(encoding='utf-8') + '\n' + original_js
    for relative, content in files.items():
        target = PAYLOAD / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        data = content.encode('utf-8')
        target.write_bytes(data)
        original = ORIGINAL / relative
        manifest['files'].append({'path': relative, 'original_sha256': sha(original.read_bytes()) if original.exists() else None, 'sha256': sha(data)})
    (HERE / 'atualizacao/manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    assets = HERE / 'previa/assets'
    assets.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ORIGINAL / 'admin/assets/css/bootstrap.css', assets / 'bootstrap.css')
    shutil.copy2(PAYLOAD / 'admin/assets/css/app.css', assets / 'app.css')
    shutil.copy2(PAYLOAD / 'admin/assets/css/app.dark.css', assets / 'app.dark.css')
    shutil.copy2(HERE / 'src/naxx.js', assets / 'naxx.js')
    shutil.copy2(HERE / 'src/importer.css', assets / 'importer.css')
    for source in ('importer.js', 'importer-ui.js', 'importer-worker.js'):
        shutil.copy2(HERE / 'src' / source, assets / source)
    # Pacote leve da atualização; o ZIP original permanece intacto.
    with zipfile.ZipFile(HERE / 'XUI-NAXX-1.5.14-atualizacao.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted((HERE / 'atualizacao').rglob('*')):
            if path.is_file():
                archive.write(path, path.relative_to(HERE))
        archive.write(HERE / 'LEIA-ME.md', 'LEIA-ME.md')
    print(f'Gerado: {len(keys)} traduções, {len(files)} arquivos de atualização.')

if __name__ == '__main__':
    build()
