# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.ai import router as ai_router
from app.api.assets import router as assets_router
from app.api.auth import router as auth_router
from app.api.inspections import router as inspections_router
from app.api.policy import router as policy_router
from app.api.tasks import router as tasks_router
from app.bootstrap import init_db_and_seed
from app.core.config import settings

app = FastAPI(
    title="Campus Weak-Current Inspection API",
    version="0.1.0",
    description="Solo-build starter backend with critical policy checks.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins_list or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_init() -> None:
    init_db_and_seed()


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "backend"}


app.include_router(policy_router, prefix="/policy", tags=["policy"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(tasks_router, prefix="/tasks", tags=["tasks"])
app.include_router(inspections_router, prefix="/inspections", tags=["inspections"])
app.include_router(assets_router, prefix="/assets", tags=["assets"])
app.include_router(ai_router, prefix="/ai", tags=["ai"])

