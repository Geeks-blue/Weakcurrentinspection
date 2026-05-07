#!/usr/bin/env python3
"""
校园弱电巡检管理系统 — 一键启动脚本
支持 Windows / macOS / Linux，自动检查并安装缺失依赖。

用法：
    python start.py              # 启动基础服务 + 后端（不含前端）
    python start.py --frontend   # 同时启动前端开发服务器
    python start.py --stop       # 停止 Docker 服务
    python start.py --logs       # 实时查看后端日志
    python start.py --status     # 查看各服务状态
"""
import argparse
import os
import platform
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

# ─────────────────────── 目录配置 ───────────────────────
ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
ADMIN_DIR = ROOT / "frontend" / "admin-web"
MOBILE_DIR = ROOT / "frontend" / "mobile-web"
LOG_DIR = ROOT / "logs"
LOG_FILE = LOG_DIR / "app.log"

# Python 最低版本要求
MIN_PYTHON = (3, 8)
# Node.js 最低版本要求
MIN_NODE = (16, 0)

# ─────────────────────── 颜色输出（跨平台） ───────────────────────
IS_WINDOWS = platform.system() == "Windows"


def _ansi(code: str, text: str) -> str:
    if IS_WINDOWS and "TERM" not in os.environ:
        return text
    return f"\033[{code}m{text}\033[0m"


def green(t): return _ansi("32", t)
def yellow(t): return _ansi("33", t)
def red(t): return _ansi("31", t)
def cyan(t): return _ansi("36", t)
def bold(t): return _ansi("1", t)


def log(msg: str): print(f"[{cyan('启动器')}] {msg}")
def ok(msg: str):  print(f"[{green('  ✓  ')}] {msg}")
def warn(msg: str): print(f"[{yellow('  ⚠  ')}] {msg}")
def err(msg: str): print(f"[{red('  ✗  ')}] {msg}")
def step(msg: str): print(f"\n{bold('──')} {msg}")


# ─────────────────────── 工具函数 ───────────────────────
def run_cmd(cmd: list, cwd: Path = ROOT, check: bool = True,
            capture: bool = False, env: dict = None) -> subprocess.CompletedProcess:
    kwargs = dict(cwd=str(cwd))
    if capture:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE
        kwargs["text"] = True
    if env:
        kwargs["env"] = {**os.environ, **env}
    result = subprocess.run(cmd, **kwargs)
    if check and result.returncode != 0:
        err(f"命令失败：{' '.join(str(c) for c in cmd)}")
        sys.exit(1)
    return result


def get_cmd_version(cmd: str, args: list = None) -> tuple:
    """获取命令版本号，返回 (major, minor) 元组；不存在返回 (0, 0)。"""
    if not shutil.which(cmd):
        return (0, 0)
    try:
        args = args or ["--version"]
        result = subprocess.run([cmd] + args, capture_output=True, text=True, timeout=5)
        output = (result.stdout + result.stderr).strip()
        import re
        m = re.search(r"(\d+)\.(\d+)", output)
        if m:
            return (int(m.group(1)), int(m.group(2)))
    except Exception:
        pass
    return (1, 0)


def wait_for_http(url: str, timeout: int = 30, interval: float = 1.5) -> bool:
    """轮询 HTTP 接口直到返回 200 或超时。"""
    import urllib.request
    import urllib.error
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def is_port_free(port: int) -> bool:
    """检查端口是否空闲。"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) != 0


# ─────────────────────── 依赖检查 ───────────────────────
def check_python_version() -> None:
    """检查 Python 版本，低于最低要求时退出。"""
    v = sys.version_info[:2]
    if v < MIN_PYTHON:
        err(f"Python 版本不足：当前 {v[0]}.{v[1]}，需要 {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+")
        err("请前往 https://python.org/downloads/ 下载最新版本。")
        sys.exit(1)
    ok(f"Python {v[0]}.{v[1]} ✓")


def check_docker() -> None:
    """检查 Docker 及 Docker Compose 是否安装并运行；在国内环境自动配置镜像加速。"""
    if not shutil.which("docker"):
        err("未找到 docker 命令。")
        err("请安装 Docker Desktop：https://docs.docker.com/get-docker/")
        sys.exit(1)

    # 检查 Docker 守护进程是否运行
    result = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
    if result.returncode != 0:
        err("Docker 守护进程未运行，请先启动 Docker Desktop 再执行本脚本。")
        sys.exit(1)

    ok("Docker ✓")

    # 检查 docker compose（v2 插件）
    result = subprocess.run(["docker", "compose", "version"],
                            capture_output=True, text=True, timeout=5)
    if result.returncode != 0:
        err("未找到 'docker compose'（需要 Docker Compose V2）。")
        err("请升级 Docker Desktop 至最新版本。")
        sys.exit(1)
    ok("Docker Compose V2 ✓")

    # 检测 Docker Hub 连通性，国内环境自动配置镜像加速
    _ensure_docker_mirror()


def _is_dockerhub_reachable() -> bool:
    """用真实 HTTPS 请求检测 Docker Hub 连通性（5 秒超时）。"""
    import urllib.request
    import urllib.error
    try:
        req = urllib.request.Request(
            "https://registry-1.docker.io/v2/",
            headers={"User-Agent": "docker/20.10"},
        )
        with urllib.request.urlopen(req, timeout=5):
            pass
        return True
    except Exception:
        return False


def _has_mirror_configured() -> bool:
    """检查是否已配置了镜像加速。"""
    daemon_json = Path("/etc/docker/daemon.json")
    if not daemon_json.exists():
        return False
    try:
        content = daemon_json.read_text()
        return "registry-mirrors" in content
    except Exception:
        return False


def _ensure_docker_mirror() -> None:
    """
    若 Docker Hub 不可达（常见于国内服务器），自动写入镜像加速配置并重启 Docker。
    仅在 Linux 且具有 sudo 权限时生效；Windows/macOS 用户需手动配置。
    """
    if _is_dockerhub_reachable():
        ok("Docker Hub 连通 ✓")
        return

    if _has_mirror_configured():
        warn("Docker Hub 仍不可达，但镜像加速已配置。将继续尝试，如失败请检查镜像源是否有效。")
        return

    warn("Docker Hub 连接超时（国内网络限制）。")

    if platform.system() != "Linux":
        warn("请手动为 Docker 配置镜像加速后重试。")
        warn("  Windows: Docker Desktop → Settings → Docker Engine → 添加 registry-mirrors")
        warn("  macOS:   Docker Desktop → Preferences → Docker Engine → 添加 registry-mirrors")
        err("无法继续，Docker Hub 不可达。")
        sys.exit(1)

    log("正在为 Docker 配置国内镜像加速（需要 sudo 权限）...")

    daemon_json = Path("/etc/docker/daemon.json")
    mirrors_config = '''{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://registry.cn-hangzhou.aliyuncs.com"
  ]
}
'''
    # 备份原有配置
    if daemon_json.exists():
        backup = daemon_json.with_suffix(".json.bak")
        result = subprocess.run(["sudo", "cp", str(daemon_json), str(backup)],
                                capture_output=True)
        if result.returncode == 0:
            log(f"原有配置已备份至 {backup}")

    # 写入新配置
    write_result = subprocess.run(
        ["sudo", "tee", str(daemon_json)],
        input=mirrors_config.encode(),
        capture_output=True,
    )
    if write_result.returncode != 0:
        err("写入 /etc/docker/daemon.json 失败，请手动配置镜像加速：")
        err("  sudo tee /etc/docker/daemon.json << 'EOF'")
        err(mirrors_config)
        err("  EOF")
        err("  sudo systemctl restart docker")
        sys.exit(1)

    ok("镜像加速配置已写入 /etc/docker/daemon.json")

    # 重载并重启 Docker
    log("重启 Docker 服务...")
    subprocess.run(["sudo", "systemctl", "daemon-reload"], check=False)
    result = subprocess.run(["sudo", "systemctl", "restart", "docker"],
                            capture_output=True)
    if result.returncode != 0:
        err("Docker 重启失败，请手动执行：sudo systemctl restart docker")
        sys.exit(1)

    time.sleep(2)

    # 再次检测
    if _is_dockerhub_reachable():
        ok("Docker Hub 连通（镜像加速生效）✓")
    else:
        warn("配置镜像加速后仍无法连通，可能需要等待几秒后重试。")
        warn("继续尝试拉取镜像，若失败请手动拉取或更换镜像源。")


def check_node() -> bool:
    """检查 Node.js 和 npm 版本，返回是否可用。"""
    node_ver = get_cmd_version("node")
    npm_ver = get_cmd_version("npm")

    if node_ver == (0, 0):
        warn("未找到 Node.js — 前端开发服务器无法启动。")
        warn("如需启动前端，请安装 Node.js 16+：https://nodejs.org/")
        return False

    if node_ver < MIN_NODE:
        warn(f"Node.js 版本较低：{node_ver[0]}.{node_ver[1]}，建议升级至 {MIN_NODE[0]}+")
        return False

    if npm_ver == (0, 0):
        warn("未找到 npm — 前端依赖无法安装。")
        return False

    ok(f"Node.js {node_ver[0]}.{node_ver[1]} / npm {npm_ver[0]}.{npm_ver[1]} ✓")
    return True


def check_pip() -> None:
    """确保 pip 可用，必要时尝试升级。"""
    venv_python = get_venv_python()
    result = subprocess.run([str(venv_python), "-m", "pip", "--version"],
                            capture_output=True, text=True)
    if result.returncode != 0:
        log("pip 不可用，尝试安装...")
        run_cmd([str(venv_python), "-m", "ensurepip", "--upgrade"], cwd=BACKEND_DIR)
    ok("pip ✓")


def check_ports() -> None:
    """检查关键端口是否被占用。"""
    ports = {18000: "后端 API", 5173: "管理端前端", 5174: "移动端前端"}
    for port, label in ports.items():
        if not is_port_free(port):
            warn(f"端口 {port}（{label}）已被占用，请确认是否已有服务运行。")
        else:
            ok(f"端口 {port}（{label}）可用 ✓")


# ─────────────────────── 环境文件 ───────────────────────
def ensure_env_file() -> None:
    env = ROOT / ".env"
    example = ROOT / ".env.example"
    if not env.exists():
        if example.exists():
            import shutil as sh
            sh.copy(example, env)
            warn(".env 不存在，已从 .env.example 自动复制。")
            warn(f"请编辑 {env} 修改数据库密码、JWT 密钥等后重新运行。")
            sys.exit(0)
        else:
            err(".env 和 .env.example 均不存在，请手动创建 .env 文件。")
            sys.exit(1)
    ok(".env 文件 ✓")


# ─────────────────────── Docker 服务 ───────────────────────
def start_docker() -> None:
    log("启动 Docker 基础服务（PostgreSQL / Redis / MinIO）...")
    run_cmd(["docker", "compose", "up", "-d"], cwd=ROOT)
    ok("Docker 服务已启动")


def stop_docker() -> None:
    log("停止 Docker 服务...")
    run_cmd(["docker", "compose", "down"], cwd=ROOT)
    ok("Docker 服务已停止")


def docker_status() -> None:
    run_cmd(["docker", "compose", "ps"], cwd=ROOT, check=False)


# ─────────────────────── Python 虚拟环境 ───────────────────────
def get_venv_python() -> Path:
    venv = BACKEND_DIR / ".venv"
    return venv / ("Scripts" if IS_WINDOWS else "bin") / ("python.exe" if IS_WINDOWS else "python")


def ensure_venv() -> None:
    """创建虚拟环境（如不存在）并安装/更新全部 Python 依赖。"""
    venv_python = get_venv_python()

    if not venv_python.exists():
        log("创建 Python 虚拟环境（.venv）...")
        run_cmd([sys.executable, "-m", "venv", str(BACKEND_DIR / ".venv")],
                cwd=BACKEND_DIR)
        ok("虚拟环境创建完成")
    else:
        ok("Python 虚拟环境已存在 ✓")

    # 升级 pip 本身
    log("升级 pip...")
    run_cmd([str(venv_python), "-m", "pip", "install", "--upgrade", "pip", "-q"],
            cwd=BACKEND_DIR)

    # 安装 / 更新后端依赖
    log("安装后端依赖（requirements.txt）...")
    run_cmd([str(venv_python), "-m", "pip", "install", "-r", "requirements.txt", "-q"],
            cwd=BACKEND_DIR)
    ok("后端 Python 依赖安装完成 ✓")


# ─────────────────────── 前端依赖 ───────────────────────
def ensure_node_modules(dir_: Path, label: str) -> None:
    """若 node_modules 不存在或 package.json 有变更则重新安装。"""
    nm = dir_ / "node_modules"
    pkg = dir_ / "package.json"
    lock = dir_ / "package-lock.json"

    need_install = not nm.exists()
    if not need_install and lock.exists():
        # 若 lock 文件比 node_modules 新，说明依赖有更新
        if lock.stat().st_mtime > nm.stat().st_mtime:
            need_install = True

    if need_install:
        log(f"安装{label}依赖（npm install）...")
        run_cmd(["npm", "install"], cwd=dir_)
        ok(f"{label}依赖安装完成 ✓")
    else:
        ok(f"{label} node_modules 已存在 ✓")


# ─────────────────────── 后端启动 ───────────────────────
def start_backend() -> subprocess.Popen:
    LOG_DIR.mkdir(exist_ok=True)
    venv_python = get_venv_python()
    log("启动后端服务（端口 18000）...")
    cmd = [str(venv_python), "-m", "uvicorn", "app.main:app",
           "--host", "0.0.0.0", "--port", "18000", "--reload"]
    log_fd = open(LOG_FILE, "a", encoding="utf-8")
    proc = subprocess.Popen(cmd, cwd=str(BACKEND_DIR),
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    import threading

    def tee(stream, file):
        for line in iter(stream.readline, b""):
            decoded = line.decode("utf-8", errors="replace")
            print(decoded, end="")
            file.write(decoded)
            file.flush()
        file.close()

    threading.Thread(target=tee, args=(proc.stdout, log_fd), daemon=True).start()
    return proc


# ─────────────────────── 前端开发服务器 ───────────────────────
def start_frontend(node_ok: bool) -> list:
    if not node_ok:
        warn("Node.js 不可用，跳过前端启动。")
        return []
    procs = []
    for label, dir_ in [("管理端", ADMIN_DIR), ("移动端", MOBILE_DIR)]:
        ensure_node_modules(dir_, label)
        log(f"启动{label}开发服务器...")
        proc = subprocess.Popen(["npm", "run", "dev"], cwd=str(dir_))
        procs.append(proc)
    return procs


# ─────────────────────── 日志追踪 ───────────────────────
def tail_logs() -> None:
    if not LOG_FILE.exists():
        warn(f"日志文件不存在：{LOG_FILE}，请先启动后端。")
        return
    log(f"追踪日志：{LOG_FILE}  （Ctrl+C 退出）")
    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            f.seek(0, 2)
            while True:
                line = f.readline()
                if line:
                    print(line, end="")
                else:
                    time.sleep(0.3)
    except KeyboardInterrupt:
        pass


# ─────────────────────── 主流程 ───────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="校园弱电巡检管理系统一键启动脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--frontend", action="store_true", help="同时启动前端开发服务器")
    parser.add_argument("--stop",     action="store_true", help="停止 Docker 服务")
    parser.add_argument("--logs",     action="store_true", help="实时查看后端日志")
    parser.add_argument("--status",   action="store_true", help="查看各服务状态")
    args = parser.parse_args()

    print(bold("\n===== 校园弱电巡检管理系统 =====\n"))

    if args.stop:
        stop_docker()
        return

    if args.logs:
        tail_logs()
        return

    if args.status:
        docker_status()
        return

    # ── 依赖检查 ──
    step("检查运行环境与依赖")
    check_python_version()
    check_docker()
    node_ok = check_node()
    ensure_env_file()
    check_ports()

    # ── 安装依赖 ──
    step("安装 / 更新后端依赖")
    ensure_venv()

    if args.frontend and node_ok:
        step("安装 / 更新前端依赖")
        ensure_node_modules(ADMIN_DIR, "管理端")
        ensure_node_modules(MOBILE_DIR, "移动端")

    # ── 启动服务 ──
    step("启动 Docker 基础服务")
    start_docker()
    log("等待数据库就绪（约 4 秒）...")
    time.sleep(4)

    step("启动后端服务")
    backend_proc = start_backend()

    log("等待后端健康检查...")
    if wait_for_http("http://127.0.0.1:18000/healthz"):
        ok("后端服务就绪 → http://127.0.0.1:18000")
    else:
        warn("后端在 30 秒内未响应，请查看日志：python start.py --logs")

    fe_procs = []
    if args.frontend:
        step("启动前端开发服务器")
        fe_procs = start_frontend(node_ok)
        time.sleep(3)
        if node_ok:
            ok("管理端 → http://localhost:5173")
            ok("移动端 → http://localhost:5174")

    # ── 汇总信息 ──
    print()
    print(bold("─── 服务运行中 ────────────────────────────────"))
    print(f"  后端 API     : http://127.0.0.1:18000")
    print(f"  API 文档     : http://127.0.0.1:18000/docs")
    print(f"  运行日志     : {LOG_FILE}")
    if args.frontend and node_ok:
        print(f"  管理端       : http://localhost:5173")
        print(f"  移动端       : http://localhost:5174")
    print(bold("────────────────────────────────────────────────"))
    print(yellow("按 Ctrl+C 停止后端（Docker 服务继续运行）"))
    print()

    all_procs = [backend_proc] + fe_procs

    def shutdown(sig, frame):
        print()
        log("正在终止服务...")
        for p in all_procs:
            try:
                p.terminate()
            except Exception:
                pass
        ok("后端已停止。如需停止 Docker：python start.py --stop")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        backend_proc.wait()
    except KeyboardInterrupt:
        shutdown(None, None)


if __name__ == "__main__":
    main()

import argparse
import os
import platform
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

# ─────────────────────── 目录配置 ───────────────────────
ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
ADMIN_DIR = ROOT / "frontend" / "admin-web"
MOBILE_DIR = ROOT / "frontend" / "mobile-web"
LOG_DIR = ROOT / "logs"
LOG_FILE = LOG_DIR / "app.log"

# ─────────────────────── 颜色输出（跨平台） ───────────────────────
IS_WINDOWS = platform.system() == "Windows"

def _ansi(code: str, text: str) -> str:
    """在支持 ANSI 的终端输出彩色文字；Windows 命令提示符降级为纯文本。"""
    if IS_WINDOWS and "TERM" not in os.environ:
        return text
    return f"\033[{code}m{text}\033[0m"

def green(t): return _ansi("32", t)
def yellow(t): return _ansi("33", t)
def red(t): return _ansi("31", t)
def cyan(t): return _ansi("36", t)
def bold(t): return _ansi("1", t)

def log(msg: str): print(f"[{cyan('启动器')}] {msg}")
def ok(msg: str):  print(f"[{green('  ✓  ')}] {msg}")
def warn(msg: str):print(f"[{yellow('  ⚠  ')}] {msg}")
def err(msg: str): print(f"[{red('  ✗  ')}] {msg}")

# ─────────────────────── 工具函数 ───────────────────────
def check_command(cmd: str) -> bool:
    """检查系统中是否安装了指定命令。"""
    return shutil.which(cmd) is not None

def run(cmd: list, cwd: Path = ROOT, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    """执行命令；capture=True 时捕获输出不打印到终端。"""
    kwargs = dict(cwd=str(cwd))
    if capture:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE
        kwargs["text"] = True
    result = subprocess.run(cmd, **kwargs)
    if check and result.returncode != 0:
        err(f"命令失败：{' '.join(cmd)}")
        sys.exit(1)
    return result

def wait_for_http(url: str, timeout: int = 30, interval: float = 1.5) -> bool:
    """轮询 HTTP 接口直到返回 200 或超时，用于探活服务启动状态。"""
    import urllib.request
    import urllib.error
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(interval)
    return False

# ─────────────────────── 前置检查 ───────────────────────
def check_prerequisites() -> None:
    """检查必要工具是否存在。"""
    log("检查运行环境...")
    missing = []
    for tool in ["docker", "python"]:
        if not check_command(tool):
            missing.append(tool)
    if missing:
        err(f"缺少必要工具：{', '.join(missing)}")
        err("请先安装后重试。Docker 下载：https://docs.docker.com/get-docker/")
        sys.exit(1)
    ok("运行环境检查通过")

def ensure_env_file() -> None:
    """若 .env 不存在，自动从 .env.example 复制并提示修改。"""
    env = ROOT / ".env"
    example = ROOT / ".env.example"
    if not env.exists():
        if example.exists():
            import shutil
            shutil.copy(example, env)
            warn(f".env 文件不存在，已从 .env.example 自动创建。")
            warn(f"请编辑 {env} 修改数据库密码、JWT 密钥等配置后重新运行。")
            sys.exit(0)
        else:
            err(".env 和 .env.example 均不存在，请手动创建 .env 文件。")
            sys.exit(1)
    ok(".env 文件存在")

# ─────────────────────── Docker 服务 ───────────────────────
def start_docker() -> None:
    """启动 Docker Compose 服务（PostgreSQL / Redis / MinIO / Nginx）。"""
    log("启动 Docker 服务...")
    run(["docker", "compose", "up", "-d"], cwd=ROOT)
    ok("Docker 服务已启动")

def stop_docker() -> None:
    """停止并移除 Docker Compose 服务。"""
    log("停止 Docker 服务...")
    run(["docker", "compose", "down"], cwd=ROOT)
    ok("Docker 服务已停止")

def docker_status() -> None:
    """显示 Docker 容器运行状态。"""
    run(["docker", "compose", "ps"], cwd=ROOT, check=False)

# ─────────────────────── Python 虚拟环境 ───────────────────────
def get_venv_python() -> Path:
    """返回 .venv 中的 Python 可执行路径（跨平台）。"""
    venv = BACKEND_DIR / ".venv"
    if IS_WINDOWS:
        return venv / "Scripts" / "python.exe"
    return venv / "bin" / "python"

def ensure_venv() -> None:
    """确保后端 .venv 已创建并安装依赖。"""
    venv_python = get_venv_python()
    if not venv_python.exists():
        log("创建 Python 虚拟环境...")
        run([sys.executable, "-m", "venv", str(BACKEND_DIR / ".venv")], cwd=BACKEND_DIR)
        ok("虚拟环境创建完成")
    log("安装/更新后端依赖...")
    run([str(venv_python), "-m", "pip", "install", "-q", "-r", "requirements.txt"],
        cwd=BACKEND_DIR)
    ok("后端依赖安装完成")

# ─────────────────────── 后端启动 ───────────────────────
def start_backend() -> subprocess.Popen:
    """在后台启动 uvicorn，日志写入 logs/app.log 并同时打印到终端。"""
    LOG_DIR.mkdir(exist_ok=True)
    venv_python = get_venv_python()
    log("启动后端服务（端口 18000）...")
    cmd = [
        str(venv_python), "-m", "uvicorn",
        "app.main:app",
        "--host", "0.0.0.0",
        "--port", "18000",
        "--reload",
    ]
    # 日志同时输出到终端和文件
    log_fd = open(LOG_FILE, "a", encoding="utf-8")
    proc = subprocess.Popen(cmd, cwd=str(BACKEND_DIR),
                            stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT)

    import threading
    def tee(stream, file):
        for line in iter(stream.readline, b""):
            decoded = line.decode("utf-8", errors="replace")
            print(decoded, end="")
            file.write(decoded)
            file.flush()
        file.close()

    threading.Thread(target=tee, args=(proc.stdout, log_fd), daemon=True).start()
    return proc

# ─────────────────────── 前端开发服务器 ───────────────────────
def npm_install_if_needed(dir_: Path) -> None:
    """若 node_modules 不存在则执行 npm install。"""
    if not (dir_ / "node_modules").exists():
        log(f"安装前端依赖：{dir_.name}...")
        run(["npm", "install"], cwd=dir_)

def start_frontend() -> list:
    """启动管理端（5173）和移动端（5174）Vite 开发服务器，返回进程列表。"""
    if not check_command("npm"):
        warn("未找到 npm，跳过前端启动。请手动进入 frontend/* 目录执行 npm run dev。")
        return []
    procs = []
    for label, dir_, port in [("管理端", ADMIN_DIR, 5173), ("移动端", MOBILE_DIR, 5174)]:
        npm_install_if_needed(dir_)
        log(f"启动{label}开发服务器（端口 {port}）...")
        proc = subprocess.Popen(["npm", "run", "dev"], cwd=str(dir_))
        procs.append(proc)
    return procs

# ─────────────────────── 日志追踪 ───────────────────────
def tail_logs() -> None:
    """实时追踪后端日志文件（类似 tail -f）。"""
    if not LOG_FILE.exists():
        warn(f"日志文件不存在：{LOG_FILE}")
        warn("请先启动后端服务再查看日志。")
        return
    log(f"追踪日志：{LOG_FILE}  （按 Ctrl+C 退出）")
    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            f.seek(0, 2)  # 跳到文件末尾
            while True:
                line = f.readline()
                if line:
                    print(line, end="")
                else:
                    time.sleep(0.3)
    except KeyboardInterrupt:
        pass

# ─────────────────────── 主流程 ───────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="校园弱电巡检管理系统一键启动脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--frontend", action="store_true", help="同时启动前端开发服务器")
    parser.add_argument("--stop",     action="store_true", help="停止 Docker 服务")
    parser.add_argument("--logs",     action="store_true", help="实时查看后端日志")
    parser.add_argument("--status",   action="store_true", help="查看各服务状态")
    args = parser.parse_args()

    print(bold("\n===== 校园弱电巡检管理系统 =====\n"))

    if args.stop:
        stop_docker()
        return

    if args.logs:
        tail_logs()
        return

    if args.status:
        docker_status()
        return

    # ── 完整启动流程 ──
    check_prerequisites()
    ensure_env_file()
    start_docker()

    # 等待 PostgreSQL 就绪（最多 20 秒）
    log("等待数据库就绪...")
    time.sleep(4)

    ensure_venv()
    backend_proc = start_backend()

    # 等待后端健康检查通过
    log("等待后端服务就绪...")
    if wait_for_http("http://127.0.0.1:18000/healthz"):
        ok("后端服务就绪 → http://127.0.0.1:18000")
    else:
        warn("后端服务未能在 30 秒内响应，请查看日志：python start.py --logs")

    fe_procs = []
    if args.frontend:
        fe_procs = start_frontend()
        time.sleep(3)
        ok("管理端开发服务器 → http://localhost:5173")
        ok("移动端开发服务器 → http://localhost:5174")

    print()
    print(bold("─── 服务运行中 ───────────────────────────────"))
    print(f"  后端 API     : http://127.0.0.1:18000")
    print(f"  API 文档     : http://127.0.0.1:18000/docs")
    print(f"  日志文件     : {LOG_FILE}")
    if args.frontend:
        print(f"  管理端       : http://localhost:5173")
        print(f"  移动端       : http://localhost:5174")
    print(bold("─────────────────────────────────────────────"))
    print(yellow("按 Ctrl+C 停止后端（Docker 服务继续运行）"))
    print()

    # 注册退出信号，优雅终止子进程
    all_procs = [backend_proc] + fe_procs

    def shutdown(sig, frame):
        print()
        log("正在终止服务...")
        for p in all_procs:
            try:
                p.terminate()
            except Exception:
                pass
        ok("后端已停止。Docker 服务仍在运行，如需停止请执行：python start.py --stop")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # 保持主线程存活
    try:
        backend_proc.wait()
    except KeyboardInterrupt:
        shutdown(None, None)


if __name__ == "__main__":
    main()
