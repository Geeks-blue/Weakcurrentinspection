# 校园弱电巡检与资产管理系统（单人开发版）

本工作区用于从零实现以下目标：
- 学生端移动网页巡检（无需安装 App）
- 教师端 Web 管理（任务、审核、派单、资产台账）
- AI 图像/历史对比能力（辅助识别弱电间内部变化）

## 1. 推荐技术栈（单人友好）
- 前端：Vue 3 + TypeScript + Vite
- UI：移动端建议 Vant，管理端建议 Element Plus
- 后端 API：FastAPI + SQLAlchemy（后续可补 Alembic）
- 数据库：PostgreSQL 16
- 缓存与队列：Redis 7
- 对象存储：MinIO（S3 兼容）
- 异步任务：Celery 或 RQ（用于 AI 对比与通知）

## 2. 关键业务红线（优先落地）
- 女寝权限限制：
  - dorm-2、dorm-4、dorm-7 仅允许分配给女性学生
  - 男性学生不可查看这三类楼栋的任何巡检记录
- 巡检真实性：
  - 二维码签到 + 定位校验
  - 扫码失败时必须手输房间编号并上传门牌照片
- 提交完整性：
  - 必填项齐全且至少 1 张照片
  - 水印字段上传后不可篡改

## 3. 当前已完成
- 路线图与里程碑：[docs/solo_dev_roadmap.md](docs/solo_dev_roadmap.md)
- 数据库初版草案：[docs/db_schema_v1.sql](docs/db_schema_v1.sql)
- 本地基础依赖编排：[docker-compose.yml](docker-compose.yml)
- 环境变量模板：[.env.example](.env.example)
- 后端基础能力（建表种子、鉴权、任务分配与查询、权限策略）：
  - [backend/app/main.py](backend/app/main.py)
  - [backend/app/api/auth.py](backend/app/api/auth.py)
  - [backend/app/api/tasks.py](backend/app/api/tasks.py)
  - [backend/app/api/inspections.py](backend/app/api/inspections.py)
  - [backend/app/api/ai.py](backend/app/api/ai.py)
  - [backend/app/core/policies.py](backend/app/core/policies.py)
  - [backend/tests/test_policy_rules.py](backend/tests/test_policy_rules.py)
- 前端管理端基础页面（登录、任务列表、AI API 输入口）：
  - [frontend/admin-web/src/App.vue](frontend/admin-web/src/App.vue)
  - [frontend/admin-web/src/api/ai.ts](frontend/admin-web/src/api/ai.ts)
  - [frontend/admin-web/src/api/backend.ts](frontend/admin-web/src/api/backend.ts)
- 教师审核闭环（待审核列表 + 审核动作）：
  - [frontend/admin-web/src/App.vue](frontend/admin-web/src/App.vue)
- 前端移动端基础页面（学生巡检提交闭环）：
  - [frontend/mobile-web/src/App.vue](frontend/mobile-web/src/App.vue)
  - [frontend/mobile-web/src/api.ts](frontend/mobile-web/src/api.ts)

## 4. 快速启动
1. 启动基础服务：docker compose up -d
2. 启动后端（进入 backend 目录）：
   - python -m venv .venv
   - .\.venv\Scripts\Activate.ps1
   - pip install -r requirements.txt
   - uvicorn app.main:app --reload --host 0.0.0.0 --port 18000
3. 启动前端管理端（进入 frontend/admin-web 目录）：
   - npm install
   - npm run dev
4. 启动前端移动端（进入 frontend/mobile-web 目录）：
  - npm install
  - npm run dev

## 5. 前端 AI API 输入口
- 位置：管理端页面中的 AI API Input Gateway 区块
- 调用模式：后端代理（推荐）/ 浏览器直连
- 支持输入并保存：endpoint、api key、model、system prompt、user prompt
- 支持一键测试请求，并显示文本结果与原始 JSON

## 6. 交付策略
- 先打通最小闭环（任务分配 -> 学生提交 -> 教师审核）
- 再逐步增强 AI 对比深度、通知渠道与资产生命周期能力
- 单人节奏建议每周有可演示版本，优先保证可运行与可验证
