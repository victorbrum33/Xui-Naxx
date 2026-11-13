#!/usr/bin/env python3
"""Limita o cache de threads MariaDB 10.3; --check é somente leitura.

--apply persiste apenas thread_cache_size. --flush-idle também limpa o cache
se houver mais threads ociosas que o limite. Não reinicia o banco nem clientes.
O backup JSON contém o valor global anterior e os bytes/modo do arquivo anterior
para restauração manual. Não há promessa de redução de RAM.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

CONFIG = Path('/etc/mysql/mariadb.conf.d/zz-naxx-memory.cnf')
BACKUPS = Path('/var/lib/naxx-performance/mysql-memory-backups')
MARKER = '# NAXX_MYSQL_MEMORY_V1\n[mysqld]\nthread_cache_size='
STATUS = ('Threads_cached', 'Threads_connected', 'Threads_created', 'Uptime')


class MemoryError(RuntimeError):
    pass


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=20)
    if result.returncode:
        raise MemoryError('O comando local do MariaDB falhou.')
    return result.stdout


def sql(statement):
    return command(['mysql', '--protocol=socket', '-u', 'root', '-N', '-B', '-e', statement]).strip()


def snapshot():
    row = sql('SELECT VERSION(), @@global.thread_handling, @@global.thread_cache_size, @@global.pid_file;').split('\t')
    if len(row) != 4 or not re.match(r'^10\.3\.\d+.*MariaDB', row[0], re.I) or row[1] != 'one-thread-per-connection' or not row[2].isdigit():
        raise MemoryError('Exigido MariaDB 10.3 com one-thread-per-connection.')
    pid = Path(row[3]).read_text().strip()
    if not pid.isdigit():
        raise MemoryError('Identidade do processo MariaDB inválida.')
    result = {'version': row[0], 'thread_handling': row[1], 'thread_cache_size': int(row[2]), 'pid': int(pid)}
    for line in sql("SHOW GLOBAL STATUS WHERE Variable_name IN ('" + "','".join(STATUS) + "');").splitlines():
        key, value = line.split('\t')
        if key in STATUS and value.isdigit():
            result[key] = int(value)
    if not all(key in result for key in STATUS):
        raise MemoryError('Diagnóstico de threads incompleto.')
    return result


def config_state():
    if CONFIG.is_symlink() or CONFIG.parent.is_symlink() or not CONFIG.parent.is_dir():
        raise MemoryError('Diretório ou arquivo de configuração incompatível.')
    if not CONFIG.exists():
        return None, None
    info = CONFIG.stat()
    raw = CONFIG.read_bytes()
    if not CONFIG.is_file() or info.st_uid != 0 or info.st_mode & 0o022 or not re.fullmatch(re.escape(MARKER).encode() + rb'[0-8]\n', raw):
        raise MemoryError('Configuração existente não pertence a este perfil. Arquivo preservado.')
    return raw, info.st_mode & 0o777


def atomic_write(path, raw, mode):
    descriptor, temporary = tempfile.mkstemp(prefix='.naxx-mysql-memory-', dir=str(path.parent))
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
            os.chmod(temporary, mode)
            if hasattr(os, 'fchown'):
                os.fchown(stream.fileno(), 0, 0)
        os.replace(temporary, str(path))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def backup(before, old, target):
    if BACKUPS.is_symlink() or BACKUPS.parent.is_symlink():
        raise MemoryError('Diretório de backup incompatível.')
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    if BACKUPS.stat().st_uid != 0:
        raise MemoryError('O backup deve pertencer ao root.')
    BACKUPS.chmod(0o700)
    descriptor, name = tempfile.mkstemp(prefix='mysql-memory-', suffix='.json', dir=str(BACKUPS))
    with os.fdopen(descriptor, 'w') as stream:
        os.chmod(name, 0o600)
        json.dump({'before': before, 'target': target, 'config': str(CONFIG),
                   'previous_base64': None if old[0] is None else base64.b64encode(old[0]).decode(),
                   'previous_mode': old[1], 'previous_sha256': None if old[0] is None else hashlib.sha256(old[0]).hexdigest()}, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    return name


def same_instance(before, current):
    return before['pid'] == current['pid'] and current['Uptime'] >= before['Uptime']


def execute(apply=False, flush_idle=False):
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise MemoryError('Execute no Linux com root e autenticação local por socket.')
    before, old = snapshot(), config_state()
    target = min(before['thread_cache_size'], 8)
    desired = (MARKER + str(target) + '\n').encode()
    changes = old[0] != desired or before['thread_cache_size'] != target
    result = {'action': 'apply' if apply else 'check', 'modified': False, 'before': before,
              'target': target, 'config': str(CONFIG), 'changes_needed': changes,
              'would_flush_idle': flush_idle and before['Threads_cached'] > target,
              'flush_requested': flush_idle, 'flushed': False, 'restart': False}
    if not apply or not (changes or (flush_idle and before['Threads_cached'] > target)):
        return result
    saved = backup(before, old, target)
    result['backup'] = saved
    fresh = snapshot()
    if not same_instance(before, fresh) or fresh['thread_cache_size'] != before['thread_cache_size'] or config_state() != old:
        raise MemoryError('A configuração mudou durante o diagnóstico. Nenhuma alteração aplicada. Backup: ' + saved)
    try:
        if old[0] != desired:
            atomic_write(CONFIG, desired, 0o644)
        if before['thread_cache_size'] != target:
            sql('SET GLOBAL thread_cache_size = ' + str(target) + ';')
        after = snapshot()
        if not same_instance(before, after) or after['thread_cache_size'] != target or config_state()[0] != desired:
            raise MemoryError('A verificação da configuração falhou.')
        if flush_idle and after['Threads_cached'] > target:
            command(['mysqladmin', '--protocol=socket', '-u', 'root', 'flush-threads'])
            result['flushed'] = True
            after = snapshot()
            if not same_instance(before, after) or after['thread_cache_size'] != target:
                raise MemoryError('A instância mudou após limpar o cache de threads.')
        result.update({'modified': changes, 'after': after})
        return result
    except Exception:
        restored = True
        try:
            current = snapshot()
            if same_instance(before, current) and current['thread_cache_size'] == target and target != before['thread_cache_size']:
                sql('SET GLOBAL thread_cache_size = ' + str(before['thread_cache_size']) + ';')
            elif not same_instance(before, current) or current['thread_cache_size'] != before['thread_cache_size']:
                restored = False
        except Exception:
            restored = False
        try:
            if config_state()[0] == desired:
                if old[0] is None:
                    CONFIG.unlink()
                else:
                    atomic_write(CONFIG, old[0], old[1])
            elif config_state() != old:
                restored = False
        except Exception:
            restored = False
        raise MemoryError(('Falha; configuração anterior restaurada.' if restored else 'Falha; restauração manual necessária.') +
                          ' Threads já liberadas não são recriadas. Backup: ' + saved) from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--check', action='store_true')
    modes.add_argument('--apply', action='store_true')
    parser.add_argument('--flush-idle', action='store_true')
    args = parser.parse_args()
    try:
        print(json.dumps(execute(args.apply, args.flush_idle), indent=2))
        return 0
    except (MemoryError, OSError, ValueError, subprocess.SubprocessError):
        error = sys.exc_info()[1]
        print(json.dumps({'ok': False, 'error': str(error) if isinstance(error, MemoryError) else 'Não foi possível concluir o perfil MariaDB.'}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
