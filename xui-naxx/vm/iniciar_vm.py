import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import webbrowser

config_path=Path('F:/virtualbox/XUI-NAXX-LAB/vm.json')
config=json.loads(config_path.read_text())
binary=Path('C:/Program Files/Oracle/VirtualBox/VBoxManage.exe')
info=subprocess.check_output([str(binary),'showvminfo',config['uuid'],'--machinereadable'],text=True)
state=next((line.split('=',1)[1].strip('"') for line in info.splitlines() if line.startswith('VMState=')), '')
if state in ('poweroff','aborted'):
    # Uma CPU evita travamentos com Hyper-V/NEM; nunca modificar a VM ligada.
    subprocess.run([str(binary),'modifyvm',config['uuid'],'--cpus','1','--paravirt-provider','none','--x86-hpet','on','--uart1','off'],check=True)
    subprocess.run([str(binary),'startvm',config['uuid'],'--type','headless'],check=True)
elif state!='running':
    raise SystemExit('A VM precisa estar desligada para aplicar o perfil de inicialização. Encerre a VM pelo sistema convidado e execute novamente.')
panel_port=int(config.get('panel_port',80))
url='http://127.0.0.1'+(':'+str(panel_port) if panel_port!=80 else '')+'/'+config.get('access_code','')+'/'
print('Aguardando o painel responder...',flush=True)
deadline=time.monotonic()+120
while True:
    try:
        with urllib.request.urlopen(url,timeout=3) as response:
            if response.status==200:
                break
    except (urllib.error.URLError,TimeoutError,OSError):
        pass
    if time.monotonic()>=deadline:
        raise SystemExit('A VM está ligada, mas o painel não respondeu em 2 minutos. Verifique o serviço e execute este BAT novamente para abrir o navegador.')
    time.sleep(2)
print('Painel XUI NAXX: '+url)
print('Neste laboratório, a prévia com dados simulados fica em http://127.0.0.1:8787/')
webbrowser.open(url)
