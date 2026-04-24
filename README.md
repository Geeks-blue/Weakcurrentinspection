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

## 5. 详细使用说明（建议按本节完整走一遍）

### 5.1 默认测试账号
- 管理员：`admin / Admin@123456`
- 教师：`teacher01 / Teacher@123`
- 学生（女）：`student_f01 / Student@123`
- 学生（男）：`student_m01 / Student@123`

### 5.2 教师端操作流程（管理台）
1. 打开管理端页面并登录教师账号。  
2. 在任务分配区选择房间、学生、截止时间，创建任务。  
3. 如分配到 `dorm-2`、`dorm-4`、`dorm-7`，系统会校验学生性别：  
   - 女性学生允许分配  
   - 男性学生会被拦截  
4. 在“待审核”列表查看学生提交记录。  
5. 执行审核动作：`通过 / 驳回 / 需整改`。  
6. 可进入资产管理区做房间/资产维护、导入、二维码查看。  

### 5.3 学生端操作流程（移动网页）
1. 用学生账号登录移动端。  
2. 在“待巡检任务”中选中一个任务。  
3. 拍摄并上传巡检照片（1~5张）。  
4. 填写巡检表单并提交。  
5. 在“我的巡检记录”中可按以下条件筛选：
   - 状态（待审核/已通过/已驳回/需整改）
   - 房间编号
   - 开始时间、结束时间

### 5.4 手动补录模式（重点）
当扫码失败时，使用“手动补录”：
1. 填写 `manual_room_code`（必须与当前任务房间一致）。  
2. 从已拍摄上传的照片中选择“门牌照片”。  
3. 系统会校验：
   - `door_plate_photo_key` 必须是当前登录学生上传的照片
   - 该照片在服务端必须真实存在
   - 该照片必须包含在本次提交的 `photo_keys` 中

不满足任一条件会拒绝提交。

### 5.5 权限与数据可见性
- 男性学生不可访问女寝楼栋（`dorm-2`、`dorm-4`、`dorm-7`）相关任务与记录。  
- 女性学生可访问全部范围。  
- 教师/管理员可查看并审核全量巡检记录。  

### 5.6 常见问题
- **报错 `NameError: name 'router' is not defined`**  
  说明本地代码未同步到最新修复版本，请先同步代码并重启后端。
- **报错 `No module named 'qrcode'`**  
  请在 `backend` 目录重新执行：`pip install -r requirements.txt`。
- **移动端提交失败（门牌照相关）**  
  请确认已选择“门牌照片”，且该图片来自当前账号本次上传列表。

## 6. 前端 AI API 输入口
- 位置：管理端页面中的 AI API Input Gateway 区块
- 调用模式：后端代理（推荐）/ 浏览器直连
- 支持输入并保存：endpoint、api key、model、system prompt、user prompt
- 支持一键测试请求，并显示文本结果与原始 JSON

## 7. 交付策略
- 先打通最小闭环（任务分配 -> 学生提交 -> 教师审核）
- 再逐步增强 AI 对比深度、通知渠道与资产生命周期能力
- 单人节奏建议每周有可演示版本，优先保证可运行与可验证
