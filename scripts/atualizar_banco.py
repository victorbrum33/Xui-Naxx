#!/usr/bin/env python3
"""Executa a manutenção nativa do XUI com backup e exclusão mútua."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path('/home/xui')
STATE = Path('/var/lib/xui-naxx/database-maintenance.json')
BACKUPS = Path('/var/backups/xui-naxx')
UNIT = 'naxx-maintenance.service'

def durable_write(path, content, mode):
    temporary = path.with_name(path.name + '.tmp')
    with os.fdopen(os.open(temporary, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, mode), 'wb') as stream:
        os.fchmod(stream.fileno(), mode)
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(directory)
    finally: os.close(directory)

def read_state():
    if not STATE.exists(): return {}
    try:
        previous = json.loads(STATE.read_text())
        if not isinstance(previous, dict): raise ValueError('Estado inválido')
        return previous
    except (ValueError, UnicodeError):
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
        damaged = STATE.with_name(STATE.name + '.invalid-' + stamp)
        os.replace(STATE, damaged)
        damaged.chmod(0o600)
        print('Estado anterior ilegível preservado; será criado um novo backup antes da manutenção.', flush=True)
        return {}

def schema_hash():
    query = "SELECT TABLE_SCHEMA,TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COALESCE(COLUMN_DEFAULT,''),EXTRA FROM information_schema.columns WHERE TABLE_SCHEMA IN ('xui','xui_migrate') ORDER BY TABLE_SCHEMA,TABLE_NAME,ORDINAL_POSITION"
    data = subprocess.check_output(['mysql','--protocol=socket','-u','root','-N','-B','-e',query])
    if not data.strip():
        raise RuntimeError('O esquema do XUI não foi encontrado; manutenção interrompida.')
    return hashlib.sha256(data).hexdigest()

def native_hash():
    digest = hashlib.sha256()
    for path in (ROOT/'status', ROOT/'bin/install/database.sql'):
        digest.update(path.read_bytes())
    return digest.hexdigest()

def backup_database():
    BACKUPS.mkdir(parents=True,exist_ok=True)
    BACKUPS.chmod(0o700)
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    path=BACKUPS/(stamp+'-before-update.sql')
    with os.fdopen(os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'wb') as stream:
        process=subprocess.run(['mysqldump','--protocol=socket','-u','root',
            '--single-transaction','--quick','--routines','--events','--triggers',
            '--hex-blob','--databases','xui','xui_migrate'],stdout=stream,stderr=subprocess.PIPE)
        stream.flush();os.fsync(stream.fileno())
    if process.returncode or path.stat().st_size<1000:
        raise RuntimeError('O backup falhou; o atualizador não foi executado.')
    print('Backup anterior à atualização: '+str(path),flush=True)
    return str(path)

def maintain():
    with open('/run/naxx-database-maintenance.lock','w') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            print('A manutenção já está em andamento.');return
        before=Path('/etc/fstab').read_bytes()
        if not any(len(fields:=line.split())>1 and fields[1]=='/' for line in before.decode().splitlines() if line.strip() and not line.lstrip().startswith('#')):
            raise RuntimeError('Montagem raiz ausente no fstab. Restaure o arquivo antes da manutenção.')
        previous=read_state()
        current={'native_sha256':native_hash(),'schema_sha256':schema_hash()}
        if any(previous.get(key)!=value for key,value in current.items()):
            current['backup']=backup_database()
        elif previous.get('backup'):
            current['backup']=previous['backup']
        try:
            result=subprocess.run([str(ROOT/'status')],stdin=subprocess.DEVNULL,timeout=150)
        finally:
            # Preserva as montagens caso uma rotina antiga esvazie este arquivo.
            if not Path('/etc/fstab').read_bytes().strip():
                durable_write(Path('/etc/fstab'),before,0o644)
                print('Arquivo de montagem restaurado após a manutenção.',flush=True)
        if result.returncode:
            raise RuntimeError('A rotina nativa falhou: código '+str(result.returncode))
        current['schema_sha256']=schema_hash()
        current['completed_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        STATE.parent.mkdir(parents=True,exist_ok=True);STATE.parent.chmod(0o700)
        durable_write(STATE,json.dumps(current,indent=2).encode(),0o600)
        print('Manutenção nativa concluída.',flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install',action='store_true',help='Instalar e iniciar a rotina automática do systemd')
    args=parser.parse_args()
    if os.geteuid()!=0:raise RuntimeError('Execute com sudo.')
    os.umask(0o077)
    if not (ROOT/'status').is_file():raise RuntimeError('XUI não foi encontrado em /home/xui.')
    if args.install:
        source=Path(__file__).resolve()
        target=Path('/usr/local/sbin/naxx-atualizar-banco')
        durable_write(target,source.read_bytes(),0o750)
        unit=Path('/etc/systemd/system')/UNIT
        durable_write(unit,(source.parent/UNIT).read_bytes(),0o644)
        subprocess.run(['systemctl','daemon-reload'],check=True)
        subprocess.run(['systemctl','enable','--now',UNIT],check=True)
        print('Atualização automática do banco habilitada na inicialização.')
    else:maintain()

if __name__=='__main__':
    try:main()
    except Exception as error:raise SystemExit('Manutenção interrompida: '+str(error))
