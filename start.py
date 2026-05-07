#!/usr/bin/env python3
"""
校园弱电巡检管理系统 — 一键启动脚本
支持 Windows / macOS / Linux

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
