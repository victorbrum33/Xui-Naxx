#!/usr/bin/env python3
"""Aplica os componentes verificados da referência, com backup do núcleo original."""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

ROOT=Path('/home/xui')
SOURCE=Path('/var/lib/xui-naxx/install/patch')
EXPECTED={
    'xui.so':'04f69edb87102ec6710dd1b0274ae0fc557c5eb7389434558600d54ad91d5b19',
    'license':'2f722718511b51ea1a621dfd91a225ee939b52b9682e16e495a434188e829327',
}

def verify_http():
    code=json.loads((SOURCE.parent/'installation-progress.json').read_text())['access_code']
    url='http://127.0.0.1/'+code+'/'
    for attempt in range(20):
        try:
            with urllib.request.urlopen(url,timeout=2) as response:
                if '/license' in response.url:raise RuntimeError('O painel continua direcionando para a licença.')
                print('Resposta HTTP:',response.status,'Destino:',response.url)
            return
        except urllib.error.URLError:
            if attempt==19:raise
            time.sleep(.5)

def main():
    parser=argparse.ArgumentParser(description='Aplicar os componentes comunitários verificados ao Xui Naxx')
    parser.add_argument('--check',action='store_true',help='Validar os arquivos sem modificar a instalação')
    args=parser.parse_args()
    if os.geteuid()!=0:raise RuntimeError('Execute com sudo.')
    if not (ROOT/'status').is_file():raise RuntimeError('A instalação XUI esperada não foi encontrada em /home/xui.')
    checks=json.loads((SOURCE/'manifest.json').read_text())
    for filename in ('xui.so','license'):
        if checks.get(filename)!=EXPECTED[filename] or hashlib.sha256((SOURCE/filename).read_bytes()).hexdigest()!=EXPECTED[filename]:raise RuntimeError('Hash da correção não confere: '+filename)
    if args.check:
        print('Correção comunitária verificada. A instalação não foi modificada.')
        return
    mappings=[('xui.so',ROOT/'bin/php/lib/php/extensions/no-debug-non-zts-20190902/xui.so'),('license',ROOT/'config/license')]
    config=ROOT/'config/config.ini'
    already_applied=all(target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest()==EXPECTED[filename] for filename,target in mappings)
    if already_applied and re.search(r'^license\s*=\s*"cracked"\s*$',config.read_text(),re.M):
        verify_http()
        print('Correção comunitária já aplicada. O backup anterior foi preservado.')
        return
    targets=[path for _,path in mappings]+[config]
    backup=SOURCE.parent/'community-backups'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    backup.mkdir(parents=True,mode=0o700)
    records=[]
    for index,target in enumerate(targets):
        record={'target':str(target),'existed':target.exists(),'backup':str(backup/str(index))}
        if target.exists():
            shutil.copy2(target,record['backup']);stat=target.stat();os.chown(record['backup'],stat.st_uid,stat.st_gid)
        records.append(record)
    (backup/'manifest.json').write_text(json.dumps(records,indent=2))
    subprocess.run(['systemctl','stop','xuione'],check=True)
    try:
        for filename,target in mappings:
            reference=target if target.exists() else config
            stat=reference.stat()
            shutil.copyfile(SOURCE/filename,target);os.chmod(target,stat.st_mode&0o777);os.chown(target,stat.st_uid,stat.st_gid)
        text,count=re.subn(r'^license\s*=.*$', 'license     =   "cracked"', config.read_text(), flags=re.M)
        if count!=1:raise RuntimeError('Campo de licença não encontrado de forma inequívoca.')
        config.write_text(text)
        subprocess.run([str(ROOT/'bin/php/bin/php'),'-v'],check=True)
        subprocess.run(['systemctl','start','xuione'],check=True)
        verify_http()
        print('Correção comunitária aplicada. Backup do núcleo:',backup)
    except Exception:
        subprocess.run(['systemctl','stop','xuione'],check=False)
        for record in records:
            target=Path(record['target'])
            if record['existed']:
                saved=Path(record['backup']);shutil.copy2(saved,target);stat=saved.stat();os.chown(target,stat.st_uid,stat.st_gid)
            elif target.exists():target.unlink()
        subprocess.run(['systemctl','start','xuione'],check=False)
        raise

if __name__=='__main__':
    try:main()
    except Exception as error:print('Erro: '+str(error),file=sys.stderr);sys.exit(1)
