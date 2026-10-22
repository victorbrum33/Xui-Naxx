#!/usr/bin/env python3
"""Perfil proporcional de PHP-FPM, com diagnóstico, backup e restauração.

Uso: sudo python3 otimizar_sistema.py --check
     sudo python3 otimizar_sistema.py --apply
     sudo python3 otimizar_sistema.py --restore /home/xui/.naxx-performance-backups/...

Não reinicia o serviço xuione, nginx ou ffmpeg. Não altera banco, crons,
limites de transmissão, autenticação ou blacklist. Preserva opcache.enable_cli
e não reinicia os processos CLI ativos.
Os 40 MB usados no cálculo são uma estimativa, não uma cota de RAM por worker.
"""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import stat
import struct
import subprocess
import sys
import tempfile
import time
import uuid

VERSION = 1
INI_REL = "bin/php/lib/php.ini"
POOL_RE = re.compile(r"bin/php/etc/[1-9][0-9]*\.conf\Z")
MASTER_RE = re.compile(r"php-fpm: master process \((.+)\)\s*\Z")
BACKUPS = ".naxx-performance-backups"


class ProfileError(RuntimeError):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(root, relative):
    if relative != INI_REL and not POOL_RE.fullmatch(relative):
        raise ProfileError("Arquivo fora do escopo do perfil.")
    path = root / relative
    current = root
    for part in Path(relative).parts:
        current = current / part
        if current.is_symlink():
            raise ProfileError("O perfil não altera caminhos com links simbólicos.")
    if not path.is_file() or root not in path.resolve().parents:
        raise ProfileError("Arquivo esperado ausente ou fora da instalação.")
    return path


def read_directive(text, key, default=None):
    matches = re.findall(r"^\s*" + re.escape(key) + r"\s*=\s*([^;\r\n]+)", text, re.M)
    return matches[-1].strip().strip('"\'') if matches else default


def numeric(value, key):
    if not re.fullmatch(r"[0-9]+", str(value)):
        raise ProfileError("Diretiva não numérica ou não suportada: " + key)
    return int(value)


def replace_directive(text, key, value):
    """Change only an active, exact directive; preserve unrelated configuration."""
    pattern = re.compile(r"^(\s*" + re.escape(key) + r"\s*=\s*)([^;\r\n]*)(.*)$", re.M)
    if pattern.search(text):
        return pattern.sub(lambda m: m[1] + str(value) + (" " if m[3].startswith(";") else "") + m[3], text)
    newline = "\r\n" if "\r\n" in text else "\n"
    return text.rstrip("\r\n") + newline + key + " = " + str(value) + newline


def atomic_write(path, data, mode, uid, gid):
    fd, name = tempfile.mkstemp(prefix=".naxx-performance-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
            os.fchmod(handle.fileno(), mode)
            if hasattr(os, "fchown"):
                os.fchown(handle.fileno(), uid, gid)
        os.replace(name, path)
        directory = os.open(str(path.parent), os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


@contextlib.contextmanager
def profile_lock(root):
    import fcntl
    path = root / ".naxx-performance.lock"
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(str(path), flags, 0o600)
    try:
        os.fchmod(fd, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ProfileError("Outra aplicação ou restauração está em andamento.")
        yield
    finally:
        os.close(fd)


class NativeSystem:
    def resources(self):
        text = Path("/proc/meminfo").read_text()
        total = int(re.search(r"^MemTotal:\s+(\d+)", text, re.M)[1]) // 1024
        cpus = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else (os.cpu_count() or 1)
        return total, max(1, cpus)

    def require_root(self):
        if not hasattr(os, "geteuid") or os.geteuid() != 0:
            raise ProfileError("Execute a aplicação ou restauração com sudo.")

    def masters(self, root, pools):
        expected = {str(root / p): p for p in pools}
        found = {}
        for path in Path("/proc").glob("[0-9]*"):
            try:
                command = (path / "cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace").strip()
                match = MASTER_RE.fullmatch(command)
                if match and match[1] in expected:
                    if (path / "exe").resolve() != (root / "bin/php/sbin/php-fpm").resolve():
                        continue
                    rel = expected[match[1]]
                    if rel in found:
                        raise ProfileError("Mais de um master encontrado para o mesmo pool.")
                    owner = path.stat()
                    found[rel] = {"pid": int(path.name), "uid": owner.st_uid, "gid": owner.st_gid}
            except (OSError, ValueError):
                continue
        if set(found) != set(pools):
            raise ProfileError("Não foi possível identificar todos os masters PHP-FPM da instalação.")
        return found

    def validate(self, root, pools, ini_data, pool_data, masters):
        binary = root / "bin/php/sbin/php-fpm"
        if not binary.is_file() or root not in binary.resolve().parents:
            raise ProfileError("Binário PHP-FPM ausente ou não suportado.")
        for rel in pools:
            owner = masters[rel]
            with tempfile.TemporaryDirectory(prefix="naxx-perf-runtime-") as name:
                directory = Path(name)
                os.chown(str(directory), owner["uid"], owner["gid"])
                for basename, data in (("php.ini", ini_data), ("pool.conf", pool_data[rel])):
                    path = directory / basename
                    path.write_bytes(data)
                    path.chmod(0o600)
                    os.chown(str(path), owner["uid"], owner["gid"])

                def drop_privileges():
                    if os.geteuid() == 0:
                        os.setgroups([])
                        os.setgid(owner["gid"])
                        os.setuid(owner["uid"])

                result = subprocess.run(
                    [str(binary), "-t", "-c", str(directory / "php.ini"), "-y", str(directory / "pool.conf")],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15,
                    preexec_fn=drop_privileges if os.geteuid() == 0 else None,
                )
                if result.returncode != 0:
                    # FPM error output can contain arbitrary config values; keep it private.
                    raise ProfileError("A validação PHP-FPM rejeitou a configuração do pool " + Path(rel).stem + ".")

    @staticmethod
    def _status(socket_path):
        def record(kind, data):
            return struct.pack("!BBHHBB", 1, kind, 1, len(data), 0, 0) + data

        def length(n):
            return bytes([n]) if n < 128 else struct.pack("!I", n | 0x80000000)

        params = {"GATEWAY_INTERFACE": "CGI/1.1", "REQUEST_METHOD": "GET", "SCRIPT_FILENAME": "/status", "SCRIPT_NAME": "/status", "REQUEST_URI": "/status", "QUERY_STRING": "json", "SERVER_NAME": "localhost", "SERVER_PORT": "80", "SERVER_PROTOCOL": "HTTP/1.1", "REMOTE_ADDR": "127.0.0.1", "CONTENT_LENGTH": "0"}
        packed = b""
        for key, value in params.items():
            key, value = key.encode(), value.encode()
            packed += length(len(key)) + length(len(value)) + key + value
        with socket.socket(socket.AF_UNIX) as client:
            client.settimeout(2)
            client.connect(str(socket_path))
            client.sendall(record(1, struct.pack("!HB5x", 1, 0)) + record(4, packed) + record(4, b"") + record(5, b""))

            def exact(size):
                data = b""
                while len(data) < size:
                    block = client.recv(size - len(data))
                    if not block:
                        raise ProfileError("Resposta PHP-FPM incompleta.")
                    data += block
                return data

            stdout = b""
            while True:
                _, kind, _, size, padding, _ = struct.unpack("!BBHHBB", exact(8))
                data = exact(size)
                if padding:
                    exact(padding)
                if kind == 6:
                    stdout += data
                    if len(stdout) > 65536:
                        raise ProfileError("Resposta de diagnóstico excedeu o esperado.")
                if kind == 3:
                    break
        return json.loads(stdout.decode().split("\r\n\r\n", 1)[-1])

    def health(self, root, pools, pool_data):
        statuses = {}
        for rel in pools:
            text = pool_data[rel].decode()
            if read_directive(text, "pm.status_path") != "/status":
                raise ProfileError("O perfil exige o diagnóstico privado /status do PHP-FPM.")
            listener = read_directive(text, "listen")
            if not listener or not listener.startswith(str(root / "bin/php/sockets") + "/"):
                raise ProfileError("Socket PHP-FPM fora do diretório esperado.")
            path = Path(listener)
            if path.is_symlink() or not stat.S_ISSOCK(path.stat().st_mode):
                raise ProfileError("Socket PHP-FPM inválido.")
            status = self._status(path)
            if not isinstance(status.get("start time"), int):
                raise ProfileError("Diagnóstico PHP-FPM indisponível.")
            statuses[rel] = {"start_time": status["start time"], "queue": status.get("listen queue", 0), "active": status.get("active processes", 0), "max_active": status.get("max active processes", 0)}
        return statuses

    def reload(self, root, pools, masters):
        for rel in pools:
            fresh = self.masters(root, pools)[rel]
            if fresh["pid"] != masters[rel]["pid"]:
                raise ProfileError("O master PHP-FPM mudou durante a operação.")
            os.kill(fresh["pid"], signal.SIGUSR2)
            time.sleep(0.2)

    def await_health(self, root, pools, pool_data, before):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                result = self.health(root, pools, pool_data)
                if all(result[p]["start_time"] != before[p]["start_time"] for p in pools):
                    return result
            except (OSError, ValueError, ProfileError):
                pass
            time.sleep(0.4)
        raise ProfileError("PHP-FPM não confirmou a recarga gradual dentro de 30 segundos.")


def make_plan(root, system):
    ini_path = safe_path(root, INI_REL)
    pools = sorted((p.relative_to(root).as_posix() for p in (root / "bin/php/etc").glob("[0-9]*.conf")), key=lambda v: int(Path(v).stem))
    if not pools:
        raise ProfileError("Nenhum pool PHP-FPM numérico foi encontrado.")
    for rel in pools:
        safe_path(root, rel)
    total_mb, cpus = system.resources()
    # Half of RAM is a planning budget, with headroom for OS, DB and streams.
    # A floor of six per pool accommodates the observed peak of five per pool.
    ram_workers = max(len(pools), int(total_mb * 0.50) // 40)
    cpu_workers = max(len(pools) * 6, cpus * 8)
    per_pool = max(1, min(32, ram_workers // len(pools), cpu_workers // len(pools)))
    old = {}; new = {}; changes = []
    ini_text = ini_path.read_bytes().decode()
    desired_ini = ini_text
    for key, target, default in (("opcache.memory_consumption", 128, 128), ("opcache.interned_strings_buffer", 8, 8)):
        current = numeric(read_directive(ini_text, key, str(default)), key)
        target = min(current, target)
        if target != current:
            desired_ini = replace_directive(desired_ini, key, target)
            changes.append({"file": INI_REL, "directive": key, "before": current, "after": target})
    old[INI_REL] = ini_path.read_bytes(); new[INI_REL] = desired_ini.encode()
    for rel in pools:
        old[rel] = safe_path(root, rel).read_bytes()
        text = old[rel].decode(); desired = text
        if read_directive(text, "pm") != "ondemand":
            raise ProfileError("Pool com gerenciamento diferente de ondemand; ajuste manual necessário.")
        current = numeric(read_directive(text, "pm.max_children"), "pm.max_children")
        targets = {"pm.max_children": min(current, per_pool)}
        requests = numeric(read_directive(text, "pm.max_requests", "0"), "pm.max_requests")
        targets["pm.max_requests"] = min(requests, 1000) if requests else 1000
        idle = read_directive(text, "pm.process_idle_timeout", "10s")
        if not re.fullmatch(r"[0-9]+s?", idle):
            raise ProfileError("Formato de tempo ocioso não suportado; ajuste manual necessário.")
        targets["pm.process_idle_timeout"] = str(max(int(idle.rstrip("s")), 15)) + "s"
        for key, value in targets.items():
            prior = read_directive(text, key)
            if str(value) != str(prior):
                desired = replace_directive(desired, key, value)
                changes.append({"file": rel, "directive": key, "before": prior, "after": value})
        new[rel] = desired.encode()
    return {"version": VERSION, "root": str(root), "memory_mb": total_mb, "cpu_count": cpus, "pool_count": len(pools), "planned_workers_per_pool": per_pool, "planned_total_workers": sum(numeric(read_directive(new[p].decode(), "pm.max_children"), "pm.max_children") for p in pools), "estimated_worker_mb": 40, "worker_estimate_is_quota": False, "opcache_cli_enable_preserved": True, "changes": changes, "notes": ["O orçamento de RAM usa estimativa de 40 MB por worker; memória real varia por requisição.", "Máximo de workers controla concorrência PHP, sem alterar limites de clientes nginx/ffmpeg.", "A memória OPcache no php.ini também valerá para novos processos CLI; enable_cli e processos CLI ativos são preservados.", "Nenhuma configuração de banco, crons ou transmissão será modificada."]}, pools, old, new


def manifest_write(backup, manifest):
    path = backup / "manifest.json"
    atomic_write(path, (json.dumps(manifest, indent=2) + "\n").encode(), 0o600, os.geteuid(), os.getegid())


def create_backup(root, old, new, plan):
    base = root / BACKUPS
    if base.is_symlink():
        raise ProfileError("Diretório de backup não pode ser link simbólico.")
    base.mkdir(mode=0o700, exist_ok=True)
    base.chmod(0o700)
    backup = base / (time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8])
    backup.mkdir(mode=0o700)
    manifest = {"version": VERSION, "root": str(root), "state": "prepared", "files": [], "plan": plan}
    for index, rel in enumerate(old):
        if old[rel] == new[rel]:
            continue
        original = safe_path(root, rel).stat()
        name = "%02d.original" % index
        target = backup / name
        atomic_write(target, old[rel], 0o600, os.geteuid(), os.getegid())
        manifest["files"].append({"path": rel, "backup": name, "before_sha256": digest(old[rel]), "applied_sha256": digest(new[rel]), "mode": stat.S_IMODE(original.st_mode), "uid": original.st_uid, "gid": original.st_gid})
    manifest_write(backup, manifest)
    return backup, manifest


def read_backup(root, value):
    backup = Path(value).absolute()
    base = root / BACKUPS
    if backup.parent != base or base.is_symlink() or backup.is_symlink() or not backup.is_dir():
        raise ProfileError("Backup fora do diretório de restauração da instalação.")
    file = backup / "manifest.json"
    if file.is_symlink() or file.stat().st_mode & 0o077:
        raise ProfileError("Manifesto de backup com permissões inválidas.")
    manifest = json.loads(file.read_text())
    if manifest.get("version") != VERSION or manifest.get("root") != str(root):
        raise ProfileError("O backup não corresponde a esta instalação.")
    seen = set(); originals = {}
    for item in manifest.get("files", []):
        rel = item.get("path", "")
        safe_path(root, rel)
        if rel in seen or not re.fullmatch(r"[0-9]{2,4}\.original", item.get("backup", "")):
            raise ProfileError("Manifesto de backup inválido.")
        seen.add(rel)
        source = backup / item["backup"]
        if source.is_symlink() or source.stat().st_mode & 0o077:
            raise ProfileError("Arquivo de backup com permissões inválidas.")
        raw = source.read_bytes()
        if digest(raw) != item.get("before_sha256"):
            raise ProfileError("Integridade do backup não confirmada.")
        if not isinstance(item.get("mode"), int) or item["mode"] & ~0o777:
            raise ProfileError("Modo de arquivo inválido no backup.")
        if not all(isinstance(item.get(k), int) and item[k] >= 0 for k in ("uid", "gid")):
            raise ProfileError("Proprietário de arquivo inválido no backup.")
        originals[rel] = raw
    if not originals:
        raise ProfileError("Backup sem arquivos para restaurar.")
    return backup, manifest, originals


def write_set(root, data, manifest):
    for item in manifest["files"]:
        rel = item["path"]
        atomic_write(safe_path(root, rel), data[rel], item["mode"], item["uid"], item["gid"])


def execute(root, system, action="check", restore=None):
    plan, pools, old, new = make_plan(root, system)
    if action == "check":
        plan.update({"ok": True, "action": "check", "modified": False})
        return plan
    system.require_root()
    with profile_lock(root):
        # Re-read after acquiring the lock so a concurrent update cannot be overwritten.
        plan, pools, old, new = make_plan(root, system)
        masters = system.masters(root, pools)
        if action == "restore":
            backup, manifest, originals = read_backup(root, restore)
            for item in manifest["files"]:
                current_hash = digest(old[item["path"]])
                if current_hash not in (item["applied_sha256"], item["before_sha256"]):
                    raise ProfileError("Arquivo alterado depois do perfil; restauração automática recusada.")
            restored = dict(old); restored.update(originals)
            if restored == old:
                return {"ok": True, "action": "restore", "modified": False, "backup": str(backup)}
            system.validate(root, pools, restored[INI_REL], {p: restored[p] for p in pools}, masters)
            before = system.health(root, pools, {p: old[p] for p in pools})
            try:
                write_set(root, restored, manifest)
                system.reload(root, pools, masters)
                health = system.await_health(root, pools, {p: restored[p] for p in pools}, before)
            except Exception:
                # If restoration fails, keep the previously working applied profile.
                write_set(root, old, manifest)
                try:
                    rollback_before = system.health(root, pools, {p: old[p] for p in pools})
                except Exception:
                    rollback_before = before
                try:
                    system.reload(root, pools, system.masters(root, pools))
                    system.await_health(root, pools, {p: old[p] for p in pools}, rollback_before)
                except Exception:
                    raise ProfileError("A restauração falhou; os arquivos anteriores foram repostos, mas a recarga não foi confirmada. Backup: " + str(backup))
                raise ProfileError("A restauração não foi confirmada; o perfil anterior foi reposto.")
            manifest["state"] = "restored"; manifest_write(backup, manifest)
            return {"ok": True, "action": "restore", "modified": True, "backup": str(backup), "health": health}
        if old == new:
            return {"ok": True, "action": "apply", "modified": False, "plan": plan}
        system.validate(root, pools, new[INI_REL], {p: new[p] for p in pools}, masters)
        before = system.health(root, pools, {p: old[p] for p in pools})
        # Verify the config bytes once more immediately before saving originals.
        if any(safe_path(root, rel).read_bytes() != raw for rel, raw in old.items()):
            raise ProfileError("Configuração alterada durante o diagnóstico; execute novamente.")
        backup, manifest = create_backup(root, old, new, plan)
        try:
            write_set(root, new, manifest)
            system.reload(root, pools, masters)
            health = system.await_health(root, pools, {p: new[p] for p in pools}, before)
        except Exception:
            try:
                write_set(root, old, manifest)
                try:
                    rollback_before = system.health(root, pools, {p: old[p] for p in pools})
                except Exception:
                    rollback_before = before
                system.reload(root, pools, system.masters(root, pools))
                system.await_health(root, pools, {p: old[p] for p in pools}, rollback_before)
                manifest["state"] = "rolled_back"; manifest_write(backup, manifest)
            except Exception:
                raise ProfileError("A aplicação falhou e a recarga do rollback não foi confirmada. Backup: " + str(backup))
            raise ProfileError("A aplicação não foi confirmada; os arquivos originais foram restaurados. Backup: " + str(backup))
        manifest["state"] = "applied"; manifest_write(backup, manifest)
        return {"ok": True, "action": "apply", "modified": True, "backup": str(backup), "plan": plan, "health": health}


def main(argv=None, system=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default="/home/xui", help="Diretório da instalação Xui Naxx")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--check", action="store_true", help="Mostrar o plano sem alterar arquivos (padrão)")
    modes.add_argument("--apply", action="store_true", help="Validar, salvar backup e aplicar com recarga gradual")
    modes.add_argument("--restore", metavar="BACKUP", help="Restaurar o backup desta instalação")
    args = parser.parse_args(argv)
    try:
        root = Path(args.root).absolute()
        if not root.is_dir() or root.is_symlink() or root.resolve() != root or root == Path(root.anchor):
            raise ProfileError("Diretório de instalação inválido.")
        action = "restore" if args.restore else ("apply" if args.apply else "check")
        result = execute(root, system or NativeSystem(), action, args.restore)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except (ProfileError, OSError, ValueError, subprocess.SubprocessError) as error:
        # Unexpected system error text can disclose paths/config; only expose controlled messages.
        message = str(error) if isinstance(error, ProfileError) else "Não foi possível concluir o diagnóstico ou a operação do perfil."
        print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
