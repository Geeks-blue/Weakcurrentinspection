# 管理端前端说明

当前页面已支持：
- 后端登录与个人任务列表联调
- 前端 AI API 输入口（endpoint、key、model、prompt）
- 教师/管理员巡检审核中心（待审核列表 + 审核动作提交）

## 1. 安装依赖
npm install

## 2. 启动
npm run dev

默认地址：http://127.0.0.1:5173

## 3. AI API 输入口
页面中的 AI API Input Gateway 区域可直接配置：
- 调用模式（后端代理 / 浏览器直连）
- AI Endpoint（例如 https://api.openai.com/v1/chat/completions）
- API Key
- Model
- System Prompt
- User Prompt

配置完成后点击 Test AI API 即可测试。

## 4. 注意事项
- 当前为了本地联调方便，API Key 会存储在浏览器 localStorage。
- 推荐优先使用后端代理模式，由后端转发到上游 AI 接口。
- 生产环境应将密钥放在服务端安全存储，避免浏览器直连暴露风险。

## 5. 审核中心说明
- 教师/管理员账号登录后，会自动加载待审核巡检记录。
- 支持审核动作：通过、驳回、需整改。
- 选择驳回或需整改时，前端会要求填写审核原因。
