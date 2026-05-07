# 日志配置模块：同时输出到控制台和 logs/ 目录下的滚动日志文件。
import logging
import os
from logging.handlers import RotatingFileHandler

# 日志目录（相对于 backend/ 目录的上一级，即项目根目录）
LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "logs")


def setup_logging(level: str = "INFO") -> None:
    """
    初始化日志系统。
    - 控制台：彩色输出，INFO 级别
    - 文件：logs/app.log，10MB 滚动，保留 5 份，DEBUG 级别
    """
    os.makedirs(LOG_DIR, exist_ok=True)

    log_level = getattr(logging, level.upper(), logging.INFO)

    # 日志格式
    fmt = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    root = logging.getLogger()
    root.setLevel(logging.DEBUG)  # root 使用最低级别，由 handler 控制粒度

    # 控制台 handler
    console = logging.StreamHandler()
    console.setLevel(log_level)
    console.setFormatter(fmt)
    root.addHandler(console)

    # 文件滚动 handler（每个文件最大 10MB，保留 5 份历史）
    log_file = os.path.join(LOG_DIR, "app.log")
    file_handler = RotatingFileHandler(
        log_file, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)

    # 屏蔽第三方库的 DEBUG 噪音
    for noisy in ("sqlalchemy.engine", "httpx", "httpcore", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    logging.getLogger("app").info("日志系统初始化完成，日志文件：%s", log_file)
