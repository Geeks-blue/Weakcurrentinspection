#!/usr/bin/env python3
"""
校园弱电巡检与资产管理系统一键启动/部署脚本。

常用命令：
  python start.py                 开发模式：启动 Docker 基础服务、后端、两个前端 dev server
  python start.py --backend-only  只启动 Docker 基础服务和后端
  python start.py --prod          生产模式：构建前端、启动 HTTPS Nginx、启动后端
  python start.py --build-frontends
  python start.py --status
  python start.py --logs
  python start.py --stop
"""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
ADMIN_DIR = ROOT / "frontend" / "admin-web"
MOBILE_DIR = ROOT / "frontend" / "mobile-web"
LOG_DIR = ROOT / "logs"
LOG_FILE = LOG_DIR / "app.log"

MIN_PYTHON = (3, 10)
MIN_NODE = (16, 0)
BACKEND_PORT = 18000
ADMIN_PORT = 5173
MOBILE_PORT = 5174

IS_WINDOWS = platform.system() == "Windows"


def _ansi(code: str, text: str) -> str:
    if IS_WINDOWS and "WT_SESSION" not in os.environ and "TERM" not in os.environ:
        return text
    return f"\033[{code}m{text}\033[0m"


def bold(text: str) -> str:
    return _ansi("1", text)


def green(text: str) -> str:
    return _ansi("32", text)


def yellow(text: str) -> str:
    return _ansi("33", text)


def red(text: str) -> str:
    return _ansi("31", text)


def cyan(text: str) -> str:
    return _ansi("36", text)


def log(message: str) -> None:
    print(f"[{cyan('启动器')}] {message}")


def ok(message: str) -> None:
    print(f"[{green('OK')}] {message}")


def warn(message: str) -> None:
    print(f"[{yellow('WARN')}] {message}")


def fail(message: str, code: int = 1) -> None:
    print(f"[{red('ERR')}] {message}")
    raise SystemExit(code)


def step(title: str) -> None:
    print()
    print(bold(f"== {title} =="))


def command_name(*candidates: str) -> str | None:
    for candidate in candidates:
        if shutil.which(candidate):
            return candidate
    return None


def run_cmd(
    cmd: list[str],
    cwd: Path = ROOT,
    check: bool = True,
    capture: bool = False,
    env: dict[str, str] | None = None,
    timeout: int | None = None,
) -> subprocess.CompletedProcess[str]:
    kwargs: dict = {
        "cwd": str(cwd),
        "text": True,
        "env": {**os.environ, **(env or {})},
    }
    if capture:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE

    result = subprocess.run(cmd, timeout=timeout, **kwargs)
    if check and result.returncode != 0:
        fail(f"命令执行失败：{' '.join(cmd)}")
    return result


def get_version(cmd: str, args: list[str] | None = None) -> tuple[int, int]:
    if not shutil.which(cmd):
        return (0, 0)
    try:
        result = run_cmd([cmd] + (args or ["--version"]), check=False, capture=True, timeout=8)
        output = f"{result.stdout or ''}\n{result.stderr or ''}"
        import re

        match = re.search(r"(\d+)\.(\d+)", output)
        if match:
            return int(match.group(1)), int(match.group(2))
    except Exception:
        pass
    return (1, 0)


def load_env_file() -> dict[str, str]:
    env_path = ROOT / ".env"
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def is_port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        return sock.connect_ex(("127.0.0.1", port)) != 0


def wait_tcp(host: str, port: int, timeout: int = 45) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(2)
            if sock.connect_ex((host, port)) == 0:
                return True
        time.sleep(1)
    return False


def wait_http(url: str, timeout: int = 45) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if 200 <= response.status < 300:
                    return True
        except Exception:
            pass
        time.sleep(1.5)
    return False


def check_python_version() -> None:
    version = sys.version_info[:2]
    if version < MIN_PYTHON:
        fail(f"Python 版本过低：当前 {version[0]}.{version[1]}，需要 {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+")
    ok(f"Python {version[0]}.{version[1]}")


def docker_compose_cmd() -> list[str]:
    docker = command_name("docker")
    if not docker:
        fail("未找到 Docker。请先安装并启动 Docker Desktop。")
    result = run_cmd([docker, "compose", "version"], check=False, capture=True, timeout=10)
    if result.returncode == 0:
        return [docker, "compose"]

    docker_compose = command_name("docker-compose")
    if docker_compose:
        warn("未检测到 Docker Compose V2，已使用 docker-compose v1 兼容模式。")
        return [docker_compose]

    fail("未找到 Docker Compose。请安装 Docker Compose V2，或在 Linux 上安装 docker-compose。")


def check_docker() -> None:
    docker = command_name("docker")
    if not docker:
        fail("未找到 Docker。请先安装 Docker Desktop。")
    result = run_cmd([docker, "info"], check=False, capture=True, timeout=15)
    if result.returncode != 0:
        fail("Docker 守护进程未运行，请先启动 Docker Desktop。")
    docker_compose_cmd()
    ok("Docker / Docker Compose")


def ensure_linux_executable_hint() -> None:
    if IS_WINDOWS:
        return
    try:
        mode = ROOT.joinpath("start.py").stat().st_mode
        if mode & 0o111:
            return
        warn("start.py 当前没有可执行位；Linux 下如需 ./start.py 启动，请执行：chmod +x start.py")
    except OSError:
        pass


def npm_cmd() -> str | None:
    if IS_WINDOWS:
        return command_name("npm.cmd", "npm")
    return command_name("npm")


def check_node(required: bool) -> bool:
    node = command_name("node")
    npm = npm_cmd()
    if not node or not npm:
        message = "未找到 Node.js/npm，无法安装或启动前端。"
        if required:
            fail(message)
        warn(message)
        return False

    node_version = get_version(node)
    if node_version < MIN_NODE:
        message = f"Node.js 版本过低：当前 {node_version[0]}.{node_version[1]}，建议 {MIN_NODE[0]}+。"
        if required:
            fail(message)
        warn(message)
        return False

    npm_version = get_version(npm)
    ok(f"Node.js {node_version[0]}.{node_version[1]} / npm {npm_version[0]}.{npm_version[1]}")
    return True


def ensure_env_file(prod: bool) -> None:
    env_path = ROOT / ".env"
    example_path = ROOT / ".env.example"
    if not env_path.exists():
        if not example_path.exists():
            fail("缺少 .env 和 .env.example，无法启动。")
        shutil.copyfile(example_path, env_path)
        warn("已从 .env.example 创建 .env。")
        if prod:
            fail("生产部署前请先修改 .env 中的数据库密码、JWT 密钥和域名配置。")

    values = load_env_file()
    if prod:
        insecure = []
        if values.get("JWT_SECRET_KEY") in {"", "change-me-in-production", "change-me"}:
            insecure.append("JWT_SECRET_KEY")
        if values.get("POSTGRES_PASSWORD") in {"", "wc_pass_please_change"}:
            insecure.append("POSTGRES_PASSWORD")
        if values.get("MINIO_ROOT_PASSWORD") in {"", "minioadmin_change"}:
            insecure.append("MINIO_ROOT_PASSWORD")
        if insecure:
            fail(f"生产部署前必须修改这些默认配置：{', '.join(insecure)}")
    ok(".env")


def warn_if_ports_busy(include_frontend: bool) -> None:
    ports = [(BACKEND_PORT, "后端 API")]
    if include_frontend:
        ports += [(ADMIN_PORT, "管理端前端"), (MOBILE_PORT, "移动端前端")]
    for port, label in ports:
        if is_port_free(port):
            ok(f"端口 {port}（{label}）可用")
        else:
            warn(f"端口 {port}（{label}）已被占用。如果是旧服务在运行，可以忽略。")


def venv_python() -> Path:
    return BACKEND_DIR / ".venv" / ("Scripts" if IS_WINDOWS else "bin") / ("python.exe" if IS_WINDOWS else "python")


def venv_is_healthy() -> bool:
    python = venv_python()
    if not python.exists():
        return False
    result = run_cmd([str(python), "--version"], check=False, capture=True, timeout=10)
    if result.returncode != 0:
        return False
    result = run_cmd([str(python), "-m", "pip", "--version"], check=False, capture=True, timeout=10)
    return result.returncode == 0


def remove_broken_venv() -> None:
    venv_dir = BACKEND_DIR / ".venv"
    if not venv_dir.exists():
        return
    resolved = venv_dir.resolve()
    if ROOT.resolve() not in resolved.parents:
        fail(f"拒绝删除工作区外的虚拟环境：{resolved}")
    warn("检测到 backend/.venv 不可用，正在重建。")
    shutil.rmtree(venv_dir)


def ensure_venv(skip_install: bool) -> None:
    if not venv_is_healthy():
        remove_broken_venv()
        log("创建 Python 虚拟环境：backend/.venv")
        run_cmd([sys.executable, "-m", "venv", str(BACKEND_DIR / ".venv")], cwd=ROOT)

    python = venv_python()
    ok("Python 虚拟环境")
    if skip_install:
        warn("已跳过 Python 依赖安装。")
        return

    log("安装/更新后端依赖。")
    run_cmd([str(python), "-m", "pip", "install", "--upgrade", "pip"], cwd=BACKEND_DIR)
    run_cmd([str(python), "-m", "pip", "install", "-r", "requirements.txt"], cwd=BACKEND_DIR)
    ok("后端依赖")


def node_modules_need_install(app_dir: Path) -> bool:
    node_modules = app_dir / "node_modules"
    package_json = app_dir / "package.json"
    package_lock = app_dir / "package-lock.json"
    if not node_modules.exists():
        return True
    newest_manifest = max(
        p.stat().st_mtime for p in (package_json, package_lock) if p.exists()
    )
    return newest_manifest > node_modules.stat().st_mtime


def ensure_node_modules(app_dir: Path, label: str, skip_install: bool) -> None:
    npm = npm_cmd()
    if not npm:
        fail("未找到 npm。")
    if skip_install:
        warn(f"已跳过 {label} 前端依赖安装。")
        return
    if node_modules_need_install(app_dir):
        log(f"安装 {label} 依赖。")
        run_cmd([npm, "install"], cwd=app_dir)
    ok(f"{label} node_modules")


def build_frontend(app_dir: Path, label: str, skip_install: bool) -> None:
    npm = npm_cmd()
    if not npm:
        fail("未找到 npm。")
    ensure_node_modules(app_dir, label, skip_install)
    log(f"构建 {label}。")
    run_cmd([npm, "run", "build"], cwd=app_dir)
    ok(f"{label} 构建完成")


def compose_up(services: list[str], profile: str | None = None) -> None:
    cmd = docker_compose_cmd()
    full_cmd = cmd[:]
    if profile and cmd[-1] == "compose":
        full_cmd += ["--profile", profile]
    full_cmd += ["up", "-d"] + services
    run_cmd(full_cmd, cwd=ROOT)


def ensure_ssl_files() -> None:
    cert = ROOT / "nginx" / "ssl" / "server.crt"
    key = ROOT / "nginx" / "ssl" / "server.key"
    if cert.exists() and key.exists():
        ok("Nginx SSL 证书")
        return
    fail(
        "生产模式需要 nginx/ssl/server.crt 和 nginx/ssl/server.key。"
        " 可先按 docs/https-setup.md 生成证书，或去掉 --prod 使用开发模式。"
    )


def start_docker_services(include_nginx: bool) -> None:
    services = ["postgres", "redis", "minio"]
    log("启动 Docker 基础服务：PostgreSQL / Redis / MinIO")
    compose_up(services)
    if include_nginx:
        ensure_ssl_files()
        log("启动 HTTPS Nginx（需要 nginx/ssl/server.crt 和 server.key）。")
        compose_up(["nginx"], profile="https")

    waits = [(5432, "PostgreSQL"), (6379, "Redis"), (9000, "MinIO")]
    if include_nginx:
        waits += [(443, "Nginx HTTPS")]
    for port, label in waits:
        if wait_tcp("127.0.0.1", port, timeout=45):
            ok(f"{label} 已就绪")
        else:
            warn(f"{label} 端口 {port} 未在预期时间内响应，请用 python start.py --status 查看。")


def stop_docker() -> None:
    log("停止 Docker Compose 服务。")
    run_cmd(docker_compose_cmd() + ["down"], cwd=ROOT)
    ok("Docker 服务已停止")


def docker_status() -> None:
    run_cmd(docker_compose_cmd() + ["ps"], cwd=ROOT, check=False)


def start_backend(prod: bool) -> subprocess.Popen:
    LOG_DIR.mkdir(exist_ok=True)
    python = venv_python()
    cmd = [
        str(python),
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        str(BACKEND_PORT),
    ]
    if not prod:
        cmd.append("--reload")

    mode = "生产模式" if prod else "开发模式"
    log(f"启动后端服务（{mode}，端口 {BACKEND_PORT}）。")
    log_file = open(LOG_FILE, "a", encoding="utf-8")
    proc = subprocess.Popen(cmd, cwd=str(BACKEND_DIR), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    import threading

    def tee_output() -> None:
        assert proc.stdout is not None
        for line in iter(proc.stdout.readline, b""):
            text = line.decode("utf-8", errors="replace")
            print(text, end="")
            log_file.write(text)
            log_file.flush()
        log_file.close()

    threading.Thread(target=tee_output, daemon=True).start()
    return proc


def start_frontend_dev(label: str, app_dir: Path) -> subprocess.Popen:
    npm = npm_cmd()
    if not npm:
        fail("未找到 npm。")
    log(f"启动 {label} Vite 开发服务。")
    return subprocess.Popen([npm, "run", "dev"], cwd=str(app_dir))


def tail_logs() -> None:
    if not LOG_FILE.exists():
        warn(f"日志文件不存在：{LOG_FILE}")
        return
    log(f"实时查看日志：{LOG_FILE}（Ctrl+C 退出）")
    try:
        with LOG_FILE.open("r", encoding="utf-8", errors="replace") as file:
            file.seek(0, 2)
            while True:
                line = file.readline()
                if line:
                    print(line, end="")
                else:
                    time.sleep(0.3)
    except KeyboardInterrupt:
        return


def print_summary(prod: bool, frontend_started: bool, nginx_started: bool) -> None:
    print()
    print(bold("服务已启动"))
    print(f"  后端 API : http://127.0.0.1:{BACKEND_PORT}")
    print(f"  API 文档 : http://127.0.0.1:{BACKEND_PORT}/docs")
    print(f"  日志文件 : {LOG_FILE}")
    if frontend_started:
        print(f"  管理端   : http://localhost:{ADMIN_PORT}")
        print(f"  移动端   : http://localhost:{MOBILE_PORT}")
    if nginx_started:
        print("  HTTPS 管理端 : https://localhost/")
        print(f"  HTTPS 移动端 : https://localhost:{MOBILE_PORT}")
    if prod:
        print("  生产提示：请确认 .env 的 CORS_ALLOW_ORIGINS、JWT 密钥和数据库密码已改为正式值。")
    print()
    print(yellow("按 Ctrl+C 停止本脚本启动的后端/前端进程；Docker 服务会继续运行。"))
    print(yellow("需要停止 Docker 基础服务时执行：python start.py --stop"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="校园弱电巡检与资产管理系统一键启动/部署脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--backend-only", action="store_true", help="只启动 Docker 基础服务和后端")
    parser.add_argument("--frontend-only", action="store_true", help="只启动两个前端开发服务")
    parser.add_argument("--prod", action="store_true", help="生产部署：构建前端、启动 HTTPS Nginx、启动后端")
    parser.add_argument("--build-frontends", action="store_true", help="只构建管理端和移动端前端")
    parser.add_argument("--skip-install", action="store_true", help="跳过 pip/npm 依赖安装")
    parser.add_argument("--skip-docker", action="store_true", help="跳过 Docker 服务启动")
    parser.add_argument("--stop", action="store_true", help="停止 Docker Compose 服务")
    parser.add_argument("--logs", action="store_true", help="实时查看后端日志")
    parser.add_argument("--status", action="store_true", help="查看 Docker Compose 服务状态")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print(bold("\n===== 校园弱电巡检与资产管理系统 ====="))

    if args.stop:
        stop_docker()
        return
    if args.logs:
        tail_logs()
        return
    if args.status:
        docker_status()
        return

    if args.prod and args.frontend_only:
        fail("--prod 与 --frontend-only 不能同时使用。")
    if args.backend_only and args.frontend_only:
        fail("--backend-only 与 --frontend-only 不能同时使用。")

    need_frontend = not args.backend_only or args.frontend_only or args.prod or args.build_frontends

    step("检查运行环境")
    check_python_version()
    ensure_linux_executable_hint()
    if not args.frontend_only and not args.build_frontends and not args.skip_docker:
        check_docker()
    node_ok = check_node(required=need_frontend)
    ensure_env_file(prod=args.prod)
    warn_if_ports_busy(include_frontend=need_frontend and not args.prod)

    if args.build_frontends:
        step("构建前端")
        if not node_ok:
            fail("Node.js/npm 不可用，无法构建前端。")
        build_frontend(ADMIN_DIR, "管理端", args.skip_install)
        build_frontend(MOBILE_DIR, "移动端", args.skip_install)
        return

    procs: list[subprocess.Popen] = []

    if not args.frontend_only:
        step("准备后端环境")
        ensure_venv(skip_install=args.skip_install)

    if need_frontend and node_ok:
        step("准备前端环境")
        ensure_node_modules(ADMIN_DIR, "管理端", args.skip_install)
        ensure_node_modules(MOBILE_DIR, "移动端", args.skip_install)

    if args.prod and node_ok:
        step("构建前端静态文件")
        build_frontend(ADMIN_DIR, "管理端", skip_install=True)
        build_frontend(MOBILE_DIR, "移动端", skip_install=True)

    if not args.frontend_only and not args.skip_docker:
        step("启动 Docker 服务")
        start_docker_services(include_nginx=args.prod)

    if not args.frontend_only:
        step("启动后端")
        backend_proc = start_backend(prod=args.prod)
        procs.append(backend_proc)
        if wait_http(f"http://127.0.0.1:{BACKEND_PORT}/healthz", timeout=60):
            ok("后端健康检查通过")
        else:
            warn(f"后端未在 60 秒内通过健康检查，请查看日志：{LOG_FILE}")

    frontend_started = False
    if not args.backend_only and not args.prod:
        step("启动前端开发服务")
        procs.append(start_frontend_dev("管理端", ADMIN_DIR))
        procs.append(start_frontend_dev("移动端", MOBILE_DIR))
        frontend_started = True

    print_summary(prod=args.prod, frontend_started=frontend_started, nginx_started=args.prod)

    def shutdown(_sig=None, _frame=None) -> None:
        print()
        log("正在停止本脚本启动的进程。")
        for proc in procs:
            if proc.poll() is None:
                try:
                    proc.terminate()
                except Exception:
                    pass
        time.sleep(1)
        for proc in procs:
            if proc.poll() is None:
                try:
                    proc.kill()
                except Exception:
                    pass
        ok("进程已停止。Docker 服务如需关闭，请执行 python start.py --stop。")
        raise SystemExit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        while procs:
            for proc in procs:
                if proc.poll() is not None:
                    warn(f"进程已退出，退出码：{proc.returncode}")
                    shutdown()
            time.sleep(1)
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()
