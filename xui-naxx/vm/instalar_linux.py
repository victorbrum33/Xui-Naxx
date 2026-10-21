#!/usr/bin/env python3
"""Instala a base XUI na VM própria; instalar_na_vm.py aplica a correção comunitária."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import runpy
import secrets
import shutil
import subprocess
import sys
import tarfile
import time

HERE = Path(__file__).resolve().parent
ROOT = Path('/home/xui')
PACKAGES = ['ca-certificates','curl','wget','unzip','zip','mariadb-server','libcurl4','libmaxminddb0','libgeoip1','libxslt1.1','libonig5','libmcrypt4','libssh2-1','libjpeg8','libpng16-16','libxml2','libssl1.1','libaio1','libnuma1','libncurses5','libtinfo5','libpcre3','libasound2','libcap2-bin','net-tools','sysstat','iproute2','iptables','certbot','tzdata','e2fsprogs']

def run(*command, **options):
    return subprocess.run(list(map(str,command)),check=True,**options)

def sql(statement, database=None, input_file=None):
    command=['mysql','--protocol=socket','-u','root']
    if database: command.append(database)
    if input_file:
        with input_file.open('rb') as stream: run(*command,stdin=stream)
    else: run(*command,input=statement.encode())

def put(path, content, mode=0o644):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(content,encoding='utf-8');path.chmod(mode)

def main():
    parser=argparse.ArgumentParser(description='Instalação completa XUI NAXX em VM Ubuntu 20.04 nova')
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    if os.geteuid()!=0: raise RuntimeError('Execute com sudo python3 vm/instalar_linux.py')
    release=dict(line.strip().split('=',1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
    if release.get('ID','').strip('"')!='ubuntu' or release.get('VERSION_ID','').strip('"')!='20.04':
        raise RuntimeError('Este pacote de laboratório foi preparado para Ubuntu 20.04, conforme a base original.')
    product=Path('/sys/class/dmi/id/product_name').read_text().strip()
    if product!='VirtualBox': raise RuntimeError('Este instalador só aceita uma VM VirtualBox nova.')
    if not any(len(fields:=line.split())>1 and fields[1]=='/' for line in Path('/etc/fstab').read_text().splitlines() if line.strip() and not line.lstrip().startswith('#')):
        raise RuntimeError('A montagem raiz está ausente em /etc/fstab. Restaure o arquivo antes de instalar para garantir a próxima inicialização.')
    package=HERE.parent / 'original'
    archive=package/'xui.tar.gz'
    installer=package/'install'
    if not archive.is_file() or not installer.is_file(): raise RuntimeError('Pacote original ausente na pasta original/.')
    original_manifest=json.loads((package/'manifest.json').read_text())
    for filename in ('xui.tar.gz','install'):
        digest=hashlib.sha256((package/filename).read_bytes()).hexdigest()
        if digest!=original_manifest[filename]: raise RuntimeError('O pacote original não passou na verificação de integridade.')
    progress_path=HERE.parent/'installation-progress.json'
    progress=json.loads(progress_path.read_text()) if progress_path.exists() else {}
    if ROOT.exists() and not progress.get('owns_installation'):
        raise RuntimeError('/home/xui já existe. A instalação foi interrompida para preservar os dados.')
    if shutil.disk_usage('/').free<5*1024**3: raise RuntimeError('São necessários pelo menos 5 GB livres na VM.')
    print('VM Ubuntu 20.04 e pacote original verificados.',flush=True)
    if args.check:return
    def mark(step):
        progress[step]=True;put(progress_path,json.dumps(progress,indent=2),0o600)
    original=runpy.run_path(str(installer),run_name='naxx_original_configuration')
    if not progress.get('packages'):
        print('Instalando dependências e MariaDB...',flush=True)
        env=dict(os.environ,DEBIAN_FRONTEND='noninteractive')
        run('apt-get','update',env=env)
        run('apt-get','install','-y','--no-install-recommends',*PACKAGES,env=env)
        mark('packages')
    if not progress.get('extracted'):
        try:pwd.getpwnam('xui')
        except KeyError:run('adduser','--system','--shell','/bin/false','--group','--disabled-login','xui')
        ROOT.mkdir(parents=True,exist_ok=True);mark('owns_installation')
        print('Extraindo os binários e o painel original...',flush=True)
        with tarfile.open(str(archive),'r:gz') as tar:
            members=tar.getmembers()
            for member in members:
                target=(ROOT/member.name).resolve()
                try:target.relative_to(ROOT)
                except ValueError:raise RuntimeError('Arquivo fora da instalação no TAR.')
                if member.issym() or member.islnk():
                    destination=(target.parent/member.linkname).resolve() if member.issym() else (ROOT/member.linkname).resolve()
                    try:destination.relative_to(ROOT)
                    except ValueError:raise RuntimeError('Link fora da instalação no TAR.')
                if member.ischr() or member.isblk() or member.isfifo():raise RuntimeError('Dispositivo não permitido no TAR.')
                member.mode &= 0o777
            tar.extractall(str(ROOT),members=members)
        mark('extracted')
    if not progress.get('database'):
        print('Configurando o banco de dados do laboratório...',flush=True)
        put(Path('/etc/mysql/mariadb.conf.d/99-naxx-lab.cnf'),'[mysqld]\nbind-address=127.0.0.1\nmax_connections=128\ninnodb_buffer_pool_size=256M\ninnodb_flush_log_at_trx_commit=2\nmax_allowed_packet=64M\nsql_mode=NO_ENGINE_SUBSTITUTION\n')
        run('systemctl','enable','--now','mariadb');run('systemctl','restart','mariadb')
        exists=subprocess.check_output(['mysql','-N','-u','root','-e',"SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME IN ('xui','xui_migrate');"]).strip()
        if exists and not progress.get('owns_database'):raise RuntimeError('Banco xui já existe. Nenhum banco existente foi apagado.')
        sql('CREATE DATABASE IF NOT EXISTS xui; CREATE DATABASE IF NOT EXISTS xui_migrate;')
        mark('owns_database')
        sql('',database='xui',input_file=ROOT/'bin/install/database.sql')
        username='naxx_'+secrets.token_hex(8);password=secrets.token_urlsafe(32)
        for host in ('localhost','127.0.0.1'):
            sql("CREATE USER IF NOT EXISTS '%s'@'%s' IDENTIFIED BY '%s'; GRANT ALL PRIVILEGES ON xui.* TO '%s'@'%s'; GRANT ALL PRIVILEGES ON xui_migrate.* TO '%s'@'%s'; GRANT ALL PRIVILEGES ON mysql.* TO '%s'@'%s'; FLUSH PRIVILEGES;" % (username,host,password,username,host,username,host,username,host))
        put(ROOT/'config/config.ini',original['rConfig']%(username,password),0o600)
        # Credenciais não são mostradas nem adicionadas ao pacote de distribuição.
        put(HERE.parent/'database-credentials.json',json.dumps({'username':username,'password':password}),0o600)
        mark('database')
    if not progress.get('configuration'):
        print('Configurando serviços do XUI...',flush=True)
        redis_password=secrets.token_urlsafe(32)
        redis=original['rRedisConfig'].replace('bind *','bind 127.0.0.1').replace('#PASSWORD#',redis_password).replace('maxclients 655350','maxclients 4096')
        put(ROOT/'bin/redis/redis.conf',redis,0o600)
        for folder in ('content/streams','tmp','signals','backups'):(ROOT/folder).mkdir(parents=True,exist_ok=True)
        # Limites adequados a uma VM de 2 GB; nenhum tmpfs de 6 GB é criado.
        unit=original['rSystemd'].replace('Restart=always','Restart=on-failure').replace('ExecRestart=/bin/bash /home/xui/service restart\n','')+'\n[Service]\nLimitNOFILE=65535\n'
        put(Path('/etc/systemd/system/xuione.service'),unit)
        run('systemctl','daemon-reload');run('systemctl','enable','xuione')
        code='naxx'+secrets.token_hex(4)
        codes=ROOT/'bin/nginx/conf/codes'
        setup=codes/'setup.conf'
        if setup.exists():setup.unlink()
        template=(codes/'template').read_text()
        put(codes/(code+'.conf'),template.replace('#WHITELIST#','').replace('#TYPE#','admin').replace('#CODE#',code).replace('#BURST#','500'))
        sql("USE xui; INSERT INTO access_codes(code, type, enabled, groups) VALUES ('%s', 0, 1, '[1]');" % code)
        progress['access_code']=code
        user=pwd.getpwnam('xui')
        run('chown','-R','xui:xui',ROOT)
        os.chmod(ROOT/'config/config.ini',0o600)
        mark('configuration')
    print('Aplicando a interface NAXX e o idioma brasileiro...',flush=True)
    run('python3',HERE.parent/'atualizacao/aplicar.py')
    run(ROOT/'bin/php/bin/php','-v')
    run('setcap','cap_net_bind_service=+ep',ROOT/'bin/nginx/sbin/nginx')
    run(ROOT/'bin/nginx/sbin/nginx','-t')
    run('chown','-R','xui:xui',ROOT/'bin/nginx/logs')
    run('systemctl','restart','xuione')
    # Aguarda apenas a criação dos sockets HTTP; estado completo é verificado depois.
    for _ in range(20):
        result=subprocess.run(['curl','--max-time','2','-s','-o','/dev/null','-w','%{http_code}','http://127.0.0.1/'+progress['access_code']+'/'],stdout=subprocess.PIPE,text=True)
        if result.returncode==0 and result.stdout!='000':break
        time.sleep(1)
    else:
        raise RuntimeError('O serviço iniciou, mas a porta HTTP não respondeu. Consulte journalctl -u xuione.')
    mark('installed')
    print('Arquivos, banco, tema e serviços instalados.',flush=True)
    print('Acesso local no Windows: http://127.0.0.1/'+progress['access_code']+'/')
    print('Base instalada. O instalador Windows aplica a correção comunitária em seguida; no primeiro acesso, conclua o setup do XUI.')

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('Instalação interrompida: '+str(error),file=sys.stderr);sys.exit(1)
