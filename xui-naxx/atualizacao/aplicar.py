#!/usr/bin/env python3
"""Aplica o tema no Linux, com verificação de versão e backup restaurável."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

BASE = Path(__file__).resolve().parent

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None

def inside(root, relative):
    path = root / relative
    try:
        path.resolve().relative_to(root)
    except ValueError:
        raise RuntimeError(f'Caminho fora da instalação: {relative}')
    if path.is_symlink():
        raise RuntimeError(f'Link simbólico não suportado: {relative}')
    return path

def write_atomic(target, source, reference):
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.naxx-', dir=target.parent)
    temp = Path(name)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(source.read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
        stat = reference.stat()
        os.chmod(temp, stat.st_mode & 0o777)
        if hasattr(os, 'chown'):
            os.chown(temp, stat.st_uid, stat.st_gid)
        os.replace(temp, target)
    finally:
        if temp.exists():
            temp.unlink()

def main():
    parser = argparse.ArgumentParser(description='Atualização visual XUI NAXX 1.5.14 — base 1.5.12')
    parser.add_argument('--root', default='/home/xui', help='Pasta da instalação XUI')
    parser.add_argument('--check', action='store_true', help='Verificar compatibilidade sem alterar arquivos')
    parser.add_argument('--restore', type=Path, help='Pasta do backup gerado por este script')
    args = parser.parse_args()
    root = Path(args.root).resolve()
    if not root.is_dir():
        raise RuntimeError(f'Instalação não encontrada: {root}')
    if args.restore:
        backup = args.restore.resolve()
        records = json.loads((backup / 'backup.json').read_text(encoding='utf-8'))
        if records['root'] != str(root):
            raise RuntimeError('O backup pertence a outra instalação.')
        for entry in records['files']:
            target = inside(root, entry['path'])
            if digest(target) not in (entry['patched_sha256'], entry['original_sha256']):
                raise RuntimeError(f'Arquivo alterado após o tema: {entry["path"]}. Restauração interrompida.')
            if entry['existed'] and digest(inside(backup, entry['path'])) != entry['original_sha256']:
                raise RuntimeError(f'Backup inválido: {entry["path"]}')
        if args.check:
            print('Backup verificado; nenhum arquivo alterado.')
            return
        for entry in reversed(records['files']):
            target = inside(root, entry['path'])
            if entry['existed']:
                source = inside(backup, entry['path'])
                write_atomic(target, source, source)
            elif target.exists():
                target.unlink()
        print('Arquivos anteriores restaurados. Recarregue o painel sem cache.')
        return
    manifest = json.loads((BASE / 'manifest.json').read_text(encoding='utf-8'))
    known_patches = {}
    # Permite atualizar uma versão do próprio tema, mantendo a verificação de bytes.
    for saved in (root / '.naxx-backups').glob('*/backup.json'):
        record = json.loads(saved.read_text(encoding='utf-8'))
        if record.get('root') == str(root):
            for item in record.get('files', []):
                known_patches.setdefault(item['path'], set()).add(item['patched_sha256'])
    changed = []
    for entry in manifest['files']:
        target = inside(root, entry['path'])
        source = inside(BASE / 'arquivos', entry['path'])
        if digest(source) != entry['sha256']:
            raise RuntimeError(f'Atualização corrompida: {entry["path"]}')
        current = digest(target)
        if current == entry['sha256']:
            continue
        if current != entry['original_sha256'] and current not in known_patches.get(entry['path'], set()):
            raise RuntimeError(f'Arquivo diferente do XUI 1.5.12 fornecido: {entry["path"]}. Nenhuma alteração aplicada.')
        changed.append(entry)
    print(f'{len(changed)} arquivo(s) compatíveis para atualização.')
    if args.check or not changed:
        return
    timestamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    backup = root / '.naxx-backups' / timestamp
    backup.mkdir(parents=True, exist_ok=False)
    records = {'root': str(root), 'files': []}
    for entry in changed:
        target = inside(root, entry['path'])
        record = {'path': entry['path'], 'existed': target.exists(), 'original_sha256': digest(target), 'patched_sha256': entry['sha256']}
        if record['existed']:
            copy = inside(backup, entry['path'])
            copy.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, copy)
            if hasattr(os, 'chown'):
                stat = target.stat()
                os.chown(copy, stat.st_uid, stat.st_gid)
        records['files'].append(record)
    (backup / 'backup.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
    applied = []
    try:
        for entry in changed:
            target = inside(root, entry['path'])
            reference = target if target.exists() else root / 'includes/langs/en.ini'
            write_atomic(target, inside(BASE / 'arquivos', entry['path']), reference)
            applied.append(entry)
    except Exception:
        for entry in reversed(applied):
            target = inside(root, entry['path'])
            source = inside(backup, entry['path'])
            if source.exists():
                write_atomic(target, source, source)
            elif target.exists():
                target.unlink()
        raise
    print(f'XUI NAXX aplicado. Backup: {backup}')
    print('Recarregue o navegador sem cache. Não é necessário reiniciar as transmissões.')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Erro: {error}', file=sys.stderr)
        sys.exit(1)
