"""Cria uma VM própria no VirtualBox usando imagem oficial e cloud-init."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import uuid

IMAGE_BASE = 'https://cloud-images.ubuntu.com/focal/current/'
IMAGE_NAME = 'focal-server-cloudimg-amd64.vmdk'
NAME = 'XUI-NAXX-LAB'

def main():
    parser = argparse.ArgumentParser(description='Criar VM local XUI NAXX no VirtualBox')
    parser.add_argument('--base-dir', type=Path, default=Path('F:/virtualbox/XUI-NAXX-LAB'))
    parser.add_argument('--no-start', action='store_true')
    args = parser.parse_args()
    binary = shutil.which('VBoxManage') or 'C:/Program Files/Oracle/VirtualBox/VBoxManage.exe'
    if not Path(binary).exists():
        raise RuntimeError('VirtualBox não encontrado. Instale-o e execute novamente.')
    try:
        import pycdlib
    except ImportError:
        raise RuntimeError('Instale a dependência do gerador de ISO: python -m pip install pycdlib')
    root = args.base_dir.resolve()
    root.mkdir(parents=True, exist_ok=True)
    config_path = root / 'vm.json'
    def vbox(*args, capture=False):
        command = [str(binary), *map(str, args)]
        return subprocess.check_output(command, text=True) if capture else subprocess.run(command, check=True)
    existing = vbox('list','vms',capture=True)
    if f'"{NAME}"' in existing:
        if not config_path.exists():
            raise RuntimeError('Já existe uma VM com esse nome. Não será modificada.')
        config = json.loads(config_path.read_text())
        if config['uuid'] not in existing:
            raise RuntimeError('A VM registrada não corresponde à configuração deste laboratório.')
        state = vbox('showvminfo',NAME,'--machinereadable',capture=True)
        state_name = next((line.split('=', 1)[1].strip('"') for line in state.splitlines() if line.startswith('VMState=')), '')
        if state_name in ('poweroff', 'aborted'):
            # Uma CPU evita o travamento de boot observado com Hyper-V/NEM.
            vbox('modifyvm', NAME, '--cpus', '1', '--paravirt-provider', 'none', '--x86-hpet', 'on', '--uart1', 'off')
            if not args.no_start:
                vbox('startvm',NAME,'--type','headless')
        elif state_name != 'running' and not args.no_start:
            raise RuntimeError('A VM precisa estar desligada para aplicar o perfil de inicialização. Encerre a VM pelo sistema convidado e execute novamente.')
        print(f'VM existente preservada. Configuração: {config_path}')
        return
    if shutil.disk_usage(root).free < 12 * 1024**3:
        raise RuntimeError('São necessários pelo menos 12 GB livres na unidade da VM.')
    key = root / 'id_ed25519'
    if not key.exists():
        subprocess.run(['ssh-keygen','-q','-t','ed25519','-N','','-C','xui-naxx-lab','-f',str(key)],check=True)
    public = key.with_suffix('.pub').read_text().strip()
    checksum_text = urllib.request.urlopen(IMAGE_BASE+'SHA256SUMS',timeout=60).read().decode()
    expected = next(line.split()[0] for line in checksum_text.splitlines() if line.split()[-1].lstrip('*') == IMAGE_NAME)
    image = root / IMAGE_NAME
    if not image.exists() or hashlib.sha256(image.read_bytes()).hexdigest() != expected:
        print('Baixando imagem oficial Ubuntu 20.04 (~601 MB)...',flush=True)
        temp = image.with_suffix('.download')
        with urllib.request.urlopen(IMAGE_BASE+IMAGE_NAME,timeout=60) as response, temp.open('wb') as output:
            shutil.copyfileobj(response,output)
        if hashlib.sha256(temp.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Hash da imagem não confere. O download não foi usado.')
        temp.replace(image)
    disk = root / 'naxx.vdi'
    if not disk.exists():
        vbox('clonemedium','disk',image,disk,'--format','VDI')
    vbox('modifymedium','disk',disk,'--resize','32768')
    user_data = '#cloud-config\nhostname: xui-naxx-lab\ntimezone: America/Sao_Paulo\nusers:\n  - name: naxx\n    gecos: XUI NAXX Lab\n    shell: /bin/bash\n    groups: [sudo]\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    lock_passwd: true\n    ssh_authorized_keys:\n      - '+public+'\nssh_pwauth: false\ndisable_root: true\n'
    metadata = 'instance-id: naxx-'+str(uuid.uuid4())+'\nlocal-hostname: xui-naxx-lab\n'
    seed = root / 'seed.iso'
    iso=pycdlib.PyCdlib(); iso.new(interchange_level=3,vol_ident='cidata',joliet=3,rock_ridge='1.09')
    for filename, content in [('user-data',user_data),('meta-data',metadata)]:
        data=content.encode(); iso.add_fp(io.BytesIO(data),len(data),iso_path='/'+filename.upper().replace('-','_')+';1',rr_name=filename,joliet_path='/'+filename)
    iso.write(str(seed)); iso.close()
    vbox('createvm','--name',NAME,'--ostype','Ubuntu20_LTS_64','--basefolder',root,'--register')
    info=vbox('showvminfo',NAME,'--machinereadable',capture=True)
    vm_uuid=next(line.split('=',1)[1].strip('"') for line in info.splitlines() if line.startswith('UUID='))
    config={'name':NAME,'uuid':vm_uuid,'directory':str(root),'key':str(key),'user':'naxx','ssh_port':2223,'panel_port':80,'preview_port':8787,'image_sha256':expected}
    config_path.write_text(json.dumps(config,indent=2),encoding='utf-8')
    vbox('modifyvm',NAME,'--memory','2048','--cpus','1','--graphicscontroller','vmsvga','--vram','16','--audio-driver','none','--nic1','nat','--nat-pf1','ssh,tcp,127.0.0.1,2223,,22','--nat-pf1','panel,tcp,127.0.0.1,80,,80','--nat-pf1','preview,tcp,127.0.0.1,8787,,8765','--boot1','disk','--boot2','dvd','--paravirt-provider','none','--x86-hpet','on','--uart1','off')
    vbox('storagectl',NAME,'--name','SATA','--add','sata','--controller','IntelAhci')
    vbox('storageattach',NAME,'--storagectl','SATA','--port','0','--device','0','--type','hdd','--medium',disk)
    vbox('storageattach',NAME,'--storagectl','SATA','--port','1','--device','0','--type','dvddrive','--medium',seed)
    if not args.no_start:
        vbox('startvm',NAME,'--type','headless')
    print(f'VM criada: {NAME}\nConfiguração: {config_path}\nSSH: porta local 2223; usuário naxx; autenticação por chave.')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Erro: {error}',file=sys.stderr)
        sys.exit(1)
