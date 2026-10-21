"""Transfere os arquivos para a VM própria e executa a instalação completa."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

HERE=Path(__file__).resolve().parent
PATCH_HASHES={
    'xui.so':'04f69edb87102ec6710dd1b0274ae0fc557c5eb7389434558600d54ad91d5b19',
    'license':'2f722718511b51ea1a621dfd91a225ee939b52b9682e16e495a434188e829327',
}

def digest(path):
    result=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):result.update(block)
    return result.hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--config',type=Path,default=Path('F:/virtualbox/XUI-NAXX-LAB/vm.json'))
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    config=json.loads(args.config.read_text())
    key=Path(config['key']);known=Path(config['directory'])/'known_hosts'
    ssh=['ssh','-i',str(key),'-p',str(config['ssh_port']),'-o','StrictHostKeyChecking=accept-new','-o','UserKnownHostsFile='+str(known),'-o','BatchMode=yes','-o','ConnectTimeout=10',config['user']+'@127.0.0.1']
    scp=['scp','-i',str(key),'-P',str(config['ssh_port']),'-o','StrictHostKeyChecking=accept-new','-o','UserKnownHostsFile='+str(known),'-o','BatchMode=yes']
    destination=config['user']+'@127.0.0.1:/home/naxx/naxx-install/'
    def run(command):return subprocess.run(command,check=True)
    root=HERE.parent.parent
    archive=root/'xui.tar.gz';installer=root/'xui-original/install'
    if not archive.exists():raise RuntimeError('Extraia xui.tar.gz do ZIP original antes da instalação.')
    patch=HERE/'community-patch'
    if not patch.is_dir():patch=root/'xui-community/patch'
    for filename,expected in PATCH_HASHES.items():
        if digest(patch/filename)!=expected:raise RuntimeError('Hash da correção comunitária não confere: '+filename)
    patch_manifest=json.loads((patch/'manifest.json').read_text())
    if any(patch_manifest.get(filename)!=expected for filename,expected in PATCH_HASHES.items()):
        raise RuntimeError('Manifesto da correção comunitária não confere.')
    manifest={filename:digest(path) for filename,path in [('xui.tar.gz',archive),('install',installer)]}
    manifest_path=HERE/'original-manifest.json';manifest_path.write_text(json.dumps(manifest,indent=2))
    run(ssh+['mkdir -p /home/naxx/naxx-install/original /home/naxx/naxx-install/vm /home/naxx/naxx-install/patch'])
    print('Transferindo o pacote original para a VM...',flush=True)
    run(scp+[str(archive),str(installer),destination+'original/'])
    run(scp+[str(manifest_path),destination+'original/manifest.json'])
    run(scp+[str(HERE/name) for name in ('instalar_linux.py','aplicar_comunidade.py','atualizar_banco.py','naxx-maintenance.service')]+[destination+'vm/'])
    run(scp+[str(patch/'xui.so'),str(patch/'license'),str(patch/'manifest.json'),destination+'patch/'])
    run(scp+['-r',str(HERE.parent/'atualizacao'),destination])
    command='cd /home/naxx/naxx-install && sudo python3 vm/instalar_linux.py'+(' --check' if args.check else '')
    run(ssh+[command])
    command='cd /home/naxx/naxx-install && sudo python3 vm/aplicar_comunidade.py'+(' --check' if args.check else '')
    run(ssh+[command])
    if not args.check:
        run(ssh+['cd /home/naxx/naxx-install && sudo python3 vm/atualizar_banco.py --install'])
        data=subprocess.check_output(ssh+['sudo python3 -c "import json; p=json.load(open(\'/home/naxx/naxx-install/installation-progress.json\')); print(json.dumps({\'access_code\':p.get(\'access_code\'),\'installed\':p.get(\'installed\')}))"'],text=True)
        access=json.loads(data);access['community_patch']=True;config.update(access);args.config.write_text(json.dumps(config,indent=2))
        panel_port=int(config.get('panel_port',80))
        panel_base='http://127.0.0.1'+(':'+str(panel_port) if panel_port!=80 else '')
        (HERE/'acesso.json').write_text(json.dumps({'vm':config['name'],'url':panel_base+'/'+access['access_code']+'/','access_code':access['access_code'],'installed':access.get('installed'),'community_patch':True,'status':'installed'},indent=2))
        print('Painel NAXX instalado. No primeiro acesso, conclua o cadastro do administrador pelo setup do XUI.')

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('Erro: '+str(error),file=sys.stderr);sys.exit(1)
