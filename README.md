# 校园弱电巡检与资产管理系统

基于 Vue 3 + FastAPI + PostgreSQL 的校园弱电机房巡检管理平台，支持移动端学生巡检、管理端教师派单/审核、AI 辅助分析和资产台账管理。

---

## 系统架构

```
┌────────────────────────────────────────────────────────────────┐
│  管理端  frontend/admin-web  (教师/管理员)  HTTPS 443          │
│  移动端  frontend/mobile-web (学生)         HTTPS 5174          │
│  后端    backend/             FastAPI        HTTPS 18000         │
│  存储    MinIO                对象存储        9000               │
│  数据库  PostgreSQL                          5432               │
└────────────────────────────────────────────────────────────────┘
```

---

## 功能概述

### 管理端（教师/管理员）
- **账户管理**：创建学生/教师/管理员账号，设置角色和性别
- **资产管理**：房间台账、资产台账，支持 CSV/XLSX 批量导入，二维码打印
- **任务派遣**：向指定学生派发弱电巡检任务，支持一次性/每周/每月周期
- **巡检审核**：通过/驳回/需整改，支持按房间卡片查看历史记录
- **AI 分析**：对单条记录或某房间全部历史记录调用 AI 给出风险评估
- **记录管理**：多维度筛选，逐条查看详情和照片

### 移动端（学生）
- **任务列表**：查看并选择当前待巡检任务，支持搜索
- **扫码签到**：拍摄房间门口二维码自动识别（支持 Safari/Chrome，微信 JSSDK 待配置）
- **参考图对比**：扫码后展示该房间历史参考照片，便于对准角度
- **资产核对**：扫码后自动加载该房间资产台账
- **照片采集**：1-5 张带水印（时间/地点/人员）照片，支持历史参考图叠加
- **巡检表单**：签到方式、锁闭状态、杂物情况、指示灯、资产核对、备注
- **记录查询**：查看自己的历史巡检记录及审核状态

---

## 快速启动

### 1. 准备环境

```bash
# 克隆项目
git clone <仓库地址>
cd weakcurrentinspection

# 配置环境变量
cp .env.example .env
# 编辑 .env 修改数据库密码、JWT 密钥等
```

### 2. 启动基础服务（Docker）

```bash
docker compose up -d
# 启动 PostgreSQL、Redis、MinIO
```

### 3. 启动后端

```bash
cd backend
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt

# 首次运行自动建表并创建种子账号
uvicorn app.main:app --reload --host 0.0.0.0 --port 18000
```

### 4. 启动管理端前端

```bash
cd frontend/admin-web
npm install
npm run dev
# 开发环境访问 http://localhost:5173
```

### 5. 启动移动端前端

```bash
cd frontend/mobile-web
npm install
npm run dev
# 开发环境访问 http://localhost:5174
```

---

## 生产部署（HTTPS）

Safari/iOS 定位功能需要 HTTPS，参见 [docs/https-setup.md](docs/https-setup.md)：

```bash
# 1. 生成本地可信证书（局域网 IP）
cd nginx/ssl
mkcert -key-file server.key -cert-file server.crt 192.168.x.x localhost

# 2. 构建前端
cd frontend/admin-web && npm run build
cd frontend/mobile-web && npm run build

# 3. 启动 Nginx（提供 HTTPS 静态文件服务）
docker compose up -d nginx

# 4. 带 SSL 启动后端
uvicorn app.main:app --host 0.0.0.0 --port 18000 \
  --ssl-keyfile nginx/ssl/server.key \
  --ssl-certfile nginx/ssl/server.crt
```

iPhone 导入根证书：`设置 → 通用 → VPN与设备管理 → 安装 → 证书信任设置 → 开启`

---

## 数据库迁移

新增字段时需手动执行 SQL（使用 psql 或 pgAdmin）：

```sql
-- v1 → v2：房间性别限制字段
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS gender_restriction VARCHAR(16) NOT NULL DEFAULT 'none';
```

---

## 初始账号

系统首次启动后自动创建以下种子账号（密码请务必在生产环境中修改）：

| 账号 | 密码 | 角色 |
|------|------|------|
| admin | Admin@123456 | 管理员 |
| teacher01 | Teacher@123 | 教师 |
| student_f01 | Student@123 | 学生（女） |
| student_m01 | Student@123 | 学生（男） |

> **生产环境**：登录管理端 → 业务面板 → 账户管理 → 修改或删除默认账号。

---

## 配置说明（.env）

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 |
| `JWT_SECRET_KEY` | JWT 签名密钥，**生产必须修改** |
| `CORS_ALLOW_ORIGINS` | 允许跨域的前端地址，HTTPS 部署需更新 |
| `MINIO_ROOT_USER` | MinIO 管理员账号 |
| `MINIO_ROOT_PASSWORD` | MinIO 管理员密码，**生产必须修改** |
| `WECHAT_APPID` | 微信公众号 AppID（扫一扫功能，选填） |
| `WECHAT_APPSECRET` | 微信公众号 AppSecret（选填） |
| `TENCENT_MAP_KEY` | 腾讯位置服务 Key，用于小程序经纬度反查文字位置 |
| `AI_PROVIDER_API_KEY` | AI 服务 API Key（选填） |
| `AI_DEFAULT_ENDPOINT` | AI 接口地址，默认 OpenAI |
| `AI_DEFAULT_MODEL` | 默认模型，默认 gpt-4o-mini |

---

## 权限说明

### 房间性别限制
每个房间可独立设置性别限制：
- **无限制**：男女学生均可巡检
- **仅限女生**：只允许女生学生巡检（派单和提交均会校验）
- **仅限男生**：只允许男生学生巡检

### 角色权限
| 角色 | 权限 |
|------|------|
| student | 查看自己的任务、提交巡检 |
| teacher | 派单、审核、查看所有记录、资产管理 |
| admin | 所有权限 + 账户管理 |

---

## 示例数据

参见 [docs/sample_rooms.csv](docs/sample_rooms.csv) 和 [docs/sample_assets.csv](docs/sample_assets.csv)，可在管理端资产管理页面直接导入。

---

## 微信扫一扫（待配置）

JSSDK 代码已集成，配置步骤：
1. 在微信公众号后台配置 JS 接口安全域名（填写移动端部署域名）
2. 在 `.env` 填写 `WECHAT_APPID` 和 `WECHAT_APPSECRET`
3. 重启后端
4. 在 `frontend/mobile-web/src/App.vue` 启用微信扫码分支（模板中已有注释标注）

---

## AI 分析功能

1. 管理端 → 系统设置 → AI 接口输入网关
2. 配置 endpoint / API Key / 模型（支持任何 OpenAI 兼容接口）
3. 在巡检记录总览中点击房间卡片 → 「🤖 AI 整体分析」
4. 单条记录点击「详情/AI分析」→ 「🤖 AI 分析建议」

---

## 目录结构

```
.
├── backend/                  # FastAPI 后端
│   ├── app/
│   │   ├── api/              # 路由处理（auth/assets/tasks/inspections/ai/wechat）
│   │   ├── core/             # 配置、策略、安全工具
│   │   ├── models/           # SQLAlchemy ORM 模型
│   │   ├── schemas/          # Pydantic 请求/响应 schema
│   │   └── main.py           # 应用入口、路由注册
│   └── requirements.txt
├── frontend/
│   ├── admin-web/            # 管理端（Vue 3 + TypeScript）
│   └── mobile-web/           # 移动端（Vue 3 + TypeScript）
├── nginx/                    # Nginx 配置和 SSL 证书目录
├── docs/                     # 文档和示例数据
│   ├── https-setup.md        # HTTPS 部署完整指南
│   ├── sample_rooms.csv      # 房间示例数据
│   └── sample_assets.csv     # 资产示例数据
├── docker-compose.yml        # 基础服务编排
└── .env.example              # 环境变量模板
```

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
