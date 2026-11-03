#!/usr/bin/env python3
"""Reduz segmentos para 2 s, preservando as janelas de buffer existentes.

sudo python3 scripts/otimizar_ondemand.py --check
sudo python3 scripts/otimizar_ondemand.py --apply
sudo python3 scripts/otimizar_ondemand.py --restore CAMINHO_DO_BACKUP

Atualiza somente três campos numéricos do banco e do cache nativo. Não reinicia
serviços nem canais; os novos segmentos entram no próximo início de cada canal.
"""
import argparse
import json
import math
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import time

KEYS = ('seg_time', 'seg_list_size', 'seg_delete_threshold')


def mysql(database, sql):
    result = subprocess.run(['mysql', '--protocol=socket', '-u', 'root', '-N', '-B',
                             database, '-e', sql], text=True, capture_output=True,
                            timeout=15)
    if result.returncode:
        raise RuntimeError('Não foi possível consultar ou atualizar o banco local.')
    return result.stdout.strip()


def read_settings(database):
    rows = mysql(database, 'SELECT id,' + ','.join(KEYS) + ' FROM settings').splitlines()
    if len(rows) != 1 or not re.fullmatch(r'[0-9]+(?:\t[0-9]+){3}', rows[0]):
        raise RuntimeError('Esperada uma única configuração com valores numéricos.')
    values = [int(value) for value in rows[0].split('\t')]
    return values[0], dict(zip(KEYS, values[1:]))


def profile(current):
    if not 1 <= current['seg_time'] <= 60 or any(
            not 1 <= current[key] <= 120 for key in KEYS[1:]):
        raise RuntimeError('Configuração fora dos limites suportados pelo perfil.')
    duration = min(current['seg_time'], 2)
    result = {'seg_time': duration}
    for key in KEYS[1:]:
        result[key] = math.ceil(current[key] * current['seg_time'] / duration)
        if result[key] > 120:
            raise RuntimeError('Preservar o buffer exigiria mais de 120 segmentos.')
    return result


def php(root, values=None, expected=None):
    # O conteúdo do cache, que inclui credenciais, nunca sai do processo PHP.
    code = r'''
$path=$argv[1];$raw=file_get_contents($path);$hash=hash('sha256',$raw);$s=igbinary_unserialize($raw);
if(!is_array($s))exit(2);
$keys=['seg_time','seg_list_size','seg_delete_threshold'];
if(isset($argv[2])){
 $expected=json_decode($argv[3],true);
 foreach($keys as $k)if((int)($s[$k]??-1)!==$expected[$k])exit(5);
 $v=json_decode($argv[2],true);foreach($keys as $k){
  if(!isset($v[$k])||!is_int($v[$k])||$v[$k]<1||$v[$k]>120)exit(3);
  $s[$k]=isset($s[$k])&&is_string($s[$k])?(string)$v[$k]:$v[$k];
 }
 $st=stat($path);$tmp=tempnam(dirname($path),'.naxx-segments-');
 try{
  $data=igbinary_serialize($s);
  if(file_put_contents($tmp,$data)!==strlen($data))throw new Exception();
  if(!chown($tmp,$st['uid'])||!chgrp($tmp,$st['gid'])||!chmod($tmp,$st['mode']&0777))throw new Exception();
  clearstatcache(true,$path);
  if(!hash_equals($hash,hash_file('sha256',$path)))throw new Exception();
  if(!rename($tmp,$path))throw new Exception();
 }catch(Throwable $e){if(is_file($tmp))unlink($tmp);exit(4);}
}
$o=[];foreach($keys as $k)$o[$k]=(int)($s[$k]??-1);echo json_encode($o);
'''
    args = [str(root / 'bin/php/bin/php'), '-r', code,
            str(root / 'tmp/cache/settings')]
    if values is not None:
        args.append(json.dumps(values))
        args.append(json.dumps(expected))
    result = subprocess.run(args, text=True, capture_output=True, timeout=10)
    if result.returncode:
        raise RuntimeError('Não foi possível validar ou atualizar o cache nativo.')
    try:
        return json.loads(result.stdout)
    except ValueError:
        raise RuntimeError('Resposta inesperada do cache nativo.') from None


def update(root, database, row_id, before, after):
    assignments = ','.join(key + '=' + str(after[key]) for key in KEYS)
    expected = ' AND '.join(key + '=' + str(before[key]) for key in KEYS)
    sql = ('UPDATE settings SET ' + assignments + ' WHERE id=' + str(row_id) +
           ' AND ' + expected + ';SELECT ROW_COUNT();')
    if mysql(database, sql) != '1':
        raise RuntimeError('A configuração mudou durante a operação; aplicação cancelada.')
    try:
        if php(root, after, before) != after or read_settings(database) != (row_id, after):
            raise RuntimeError('A verificação do perfil falhou.')
    except Exception:
        # Reverte somente os mesmos campos, e somente se ainda forem os nossos.
        reverse = ','.join(key + '=' + str(before[key]) for key in KEYS)
        guard = ' AND '.join(key + '=' + str(after[key]) for key in KEYS)
        restored = mysql(database, 'UPDATE settings SET ' + reverse + ' WHERE id=' +
                         str(row_id) + ' AND ' + guard + ';SELECT ROW_COUNT();')
        if restored != '1' or read_settings(database) != (row_id, before):
            raise RuntimeError('Conflito com outra edição; rollback automático interrompido.') from None
        cached = php(root)
        if cached not in (before, after):
            raise RuntimeError('Cache alterado por outra edição; sincronize no painel.') from None
        if cached != before:
            php(root, before, cached)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='/home/xui')
    parser.add_argument('--database', default='xui')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--check', action='store_true')
    group.add_argument('--apply', action='store_true')
    group.add_argument('--restore', type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', args.database):
        raise RuntimeError('Nome de banco inválido.')
    root = Path(args.root).resolve(strict=True)
    for relative in ('bin/php/bin/php', 'tmp/cache/settings'):
        path = root / relative
        if ((relative == 'tmp/cache/settings' and path.is_symlink()) or
                not path.is_file() or root not in path.resolve().parents):
            raise RuntimeError('Arquivo nativo ausente ou fora da instalação.')
    row_id, current = read_settings(args.database)
    if php(root) != current:
        raise RuntimeError('Banco e cache divergem; sincronize as configurações no painel.')
    target = profile(current)
    backup = None
    if args.restore:
        path = args.restore.resolve(strict=True)
        info = path.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('O backup deve pertencer ao root e não permitir escrita externa.')
        saved = json.loads(path.read_text())
        if (saved.get('root') != str(root) or saved.get('database') != args.database or
                saved.get('id') != row_id or saved.get('after') != current):
            raise RuntimeError('O backup não corresponde à instalação ou ao perfil atual.')
        target = saved['before']
        if set(target) != set(KEYS) or any(type(v) is not int or not 1 <= v <= 120
                                          for v in target.values()):
            raise RuntimeError('Valores de restauração inválidos.')
    if (args.apply or args.restore) and target != current:
        if os.geteuid() != 0:
            raise RuntimeError('Execute a aplicação ou restauração com sudo.')
        if args.apply:
            folder = root / '.naxx-ondemand-backups'
            if folder.is_symlink():
                raise RuntimeError('A pasta de backup não pode ser um link simbólico.')
            folder.mkdir(mode=0o700, exist_ok=True)
            fd, name = tempfile.mkstemp(prefix=time.strftime('%Y%m%d-%H%M%S-'),
                                        suffix='.json', dir=folder)
            backup = name
            with os.fdopen(fd, 'w') as handle:
                json.dump({'root': str(root), 'database': args.database, 'id': row_id,
                           'before': current, 'after': target}, handle, indent=2)
        update(root, args.database, row_id, current, target)
    print(json.dumps({'mode': 'check' if args.check else 'restore' if args.restore else 'apply',
                      'before': current, 'after': target, 'backup': backup,
                      'applied': not args.check and target != current,
                      'restart_required': target != current,
                      'scope': 'Novos inícios de canais; nenhum processo reiniciado.'}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error))
