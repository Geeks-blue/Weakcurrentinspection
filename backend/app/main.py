# FastAPI 应用入口：注册路由、中间件、启动事件。
import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.ai import router as ai_router
from app.api.assets import router as assets_router
from app.api.auth import router as auth_router
from app.api.inspections import router as inspections_router
from app.api.policy import router as policy_router
from app.api.tasks import router as tasks_router
from app.api.wechat import router as wechat_router
from app.bootstrap import init_db_and_seed
from app.core.config import settings
from app.core.logging_setup import setup_logging

# 初始化日志（DEBUG 写入文件，INFO 显示在控制台）
setup_logging(level="INFO")
logger = logging.getLogger("app")

app = FastAPI(
    title="校园弱电巡检管理系统 API",
    version="1.0.0",
    description="支持学生巡检、教师派单审核、资产管理、AI分析。",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins_list or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """记录每个 HTTP 请求的方法、路径、耗时和状态码。"""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s → %d  (%.1fms)",
        request.method,
        request.url.path,
        response.status_code,
        elapsed,
    )
    return response


@app.on_event("startup")
def startup_init() -> None:
    """应用启动：建表、植入种子数据。"""
    logger.info("后端服务启动中...")
    init_db_and_seed()
    logger.info("数据库初始化完成，服务已就绪。")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """健康检查接口，用于运维监控或一键启动脚本探活。"""
    return {"status": "ok", "service": "backend"}


# 注册各业务路由
app.include_router(policy_router, prefix="/policy", tags=["policy"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(tasks_router, prefix="/tasks", tags=["tasks"])
app.include_router(inspections_router, prefix="/inspections", tags=["inspections"])
app.include_router(assets_router, prefix="/assets", tags=["assets"])
app.include_router(ai_router, prefix="/ai", tags=["ai"])
app.include_router(wechat_router, prefix="/wechat", tags=["wechat"])

