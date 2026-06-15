# 后端启动说明

> ⚠️ Windows 原生 PowerShell/CMD 不再作为完整后端运行的推荐环境。后端依赖 PostgreSQL、Docker Compose、文件上传目录和 HTTPS/局域网访问，原生 Windows 容易出现路径、权限、网络和证书差异。Windows 用户建议使用 **WSL2 Ubuntu + Docker Desktop WSL 集成** 启动后端与基础服务。

## 0. 必需环境变量
可在项目根目录 .env 中配置，或运行前手动导出：

- DATABASE_URL=postgresql+psycopg2://wc_user:wc_pass_please_change@127.0.0.1:5432/wc_inspection
- JWT_SECRET_KEY=change-me-in-production
- JWT_ALGORITHM=HS256
- ACCESS_TOKEN_EXPIRE_MINUTES=480
- AI_PROVIDER_API_KEY=
- AI_DEFAULT_ENDPOINT=https://api.openai.com/v1/chat/completions
- AI_DEFAULT_MODEL=gpt-4o-mini
- AI_PROXY_TIMEOUT_SECONDS=30
- CORS_ALLOW_ORIGINS=*
- TENCENT_MAP_KEY=腾讯位置服务 Key（小程序文字位置解析）
- WECHAT_TASK_TEMPLATE_ID=公众号任务派发模板消息 ID
- WECHAT_TASK_NOTIFY_URL=公众号模板消息跳转网页地址（可选）
- WECHAT_TASK_MINIPROGRAM_APPID=公众号模板消息跳转小程序 AppID（可选）
- WECHAT_TASK_MINIPROGRAM_PAGEPATH=pages/student/tasks/tasks
- TENCENT_MAP_SECRET_KEY=腾讯位置服务 Key 的签名校验 Secret key（SK）

公众号派单通知说明：
- 学生账号需在管理端账户管理中填写公众号 OpenID。
- 模板消息建议包含 `first`、`keyword1`（任务标题）、`keyword2`（房间）、`keyword3`（截止时间）、`keyword4`（派发人）、`remark`。
- 若未配置模板 ID、AppID/AppSecret 或学生 OpenID，派单仍会成功，仅跳过公众号通知。

小程序文字位置解析说明：
- 腾讯位置服务 Key 需启用 WebServiceAPI。
- 授权方式选择“签名校验”时，需要同时配置 `TENCENT_MAP_KEY` 和 `TENCENT_MAP_SECRET_KEY`。
- 后端会按 `/ws/geocoder/v1/?get_poi=0&key=...&location=lat,lng + SK` 计算 `sig`，小程序端不会暴露 Key 或 SK。

## 1. 创建并激活虚拟环境

### 推荐：Linux / WSL2

```bash
python -m venv .venv
source .venv/bin/activate
```

### 仅临时调试：Windows PowerShell

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

如 PowerShell 禁止执行激活脚本：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

> 如果后续依赖安装、数据库连接或文件路径异常，请切换到 WSL2，不建议继续适配原生 Windows。

## 2. 安装依赖

```bash
pip install -r requirements.txt
```

## 3. 启动服务

```bash
uvicorn app.main:app --reload --port 8000
```

局域网访问（同一 Wi-Fi 下其他设备访问）请使用：

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 18000
```

说明：
- 不加 `--host 0.0.0.0` 时，服务默认只监听 `127.0.0.1`，局域网设备无法访问。
- Windows 需要放行 18000 入站端口（管理员 PowerShell）：
  - netsh advfirewall firewall add rule name="WC Backend 18000" dir=in action=allow protocol=TCP localport=18000
- 前端登录地址现在会跟随当前浏览器访问的主机名自动拼接后端和移动端端口，因此局域网访问时不再需要手工改代码里的 `127.0.0.1`。

## Windows 推荐启动方式

完整本地联调建议：

1. 在 Windows 安装 Docker Desktop，启用 WSL2 backend。
2. 安装 Ubuntu WSL2，并在 Docker Desktop 中启用 WSL 集成。
3. 在 WSL2 中进入项目根目录，执行 `cp .env.example .env`。
4. 在 WSL2 中启动基础服务：`docker compose up -d postgres redis minio`。
5. 在 WSL2 中进入 `backend/`，创建虚拟环境并启动后端。

不建议在原生 Windows 下：

- 运行生产 HTTPS 模式。
- 直接维护 PostgreSQL 数据目录。
- 混用 Windows 路径和 WSL 路径运行 Docker Compose。

## 常见启动报错（StringDataRightTruncation）
如果启动时报错：
- value too long for type character varying(8)

通常是因为旧库中 `buildings.gender_restriction` 列长度仍为 8，但种子数据会写入 `female_only`（11 个字符）。

可执行以下 SQL 修复（PostgreSQL）：
ALTER TABLE buildings
  ALTER COLUMN gender_restriction TYPE VARCHAR(16);

说明：当前项目启动阶段使用 SQLAlchemy `create_all`，不会自动迁移已存在列的长度。

## 4. 关键接口自测
- GET /healthz
- POST /auth/login
- GET /auth/me（Bearer Token）
- POST /policy/student-access-check
- POST /policy/teacher-assign-check
- POST /tasks/validate-assignment
- POST /tasks/assign（teacher/admin）
- GET /tasks/my（student）
- POST /inspections/submit（student）
- GET /inspections/my（student）
- GET /inspections/pending-review（teacher/admin）
- POST /inspections/{inspection_id}/review（teacher/admin）
- POST /ai/proxy/chat（已登录用户可用）

## 5. 启动后自动生成的测试账号
- admin / Admin@123456
- teacher01 / Teacher@123
- student_f01 / Student@123
- student_m01 / Student@123

## 6. 权限规则示例请求
POST /policy/teacher-assign-check
{
  "student_gender": "male",
  "building_code": "dorm-2"
}

预期返回：
{
  "allowed": false,
  "reason": "Female-only dorm task cannot be assigned to male student."
}

## 7. 运行测试
pytest -q

## 8. AI 代理接口示例
POST /ai/proxy/chat
{
  "endpoint": "https://api.openai.com/v1/chat/completions",
  "api_key": "",
  "model": "gpt-4o-mini",
  "system_prompt": "你是巡检分析助手",
  "user_prompt": "请分析以下巡检异常摘要",
  "temperature": 0.2
}

说明：
- 若 api_key 为空，后端会尝试使用 AI_PROVIDER_API_KEY。
- 该接口用于前端“后端代理模式”调用，降低浏览器直连暴露风险。
