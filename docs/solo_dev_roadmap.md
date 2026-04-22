# 单人开发路线图（V1）

## A. MVP 边界（仅保留必须项）
1. 用户与角色管理
- 角色：student、teacher、maintainer、admin
- 学生档案包含性别字段
- 权限策略必须阻断男性访问 dorm-2、dorm-4、dorm-7 相关资源

2. 弱电间与资产基线
- 可创建/编辑弱电间并绑定资产
- 每个弱电间仅 1 个二维码（资产不单独贴码）
- 资产状态可追踪历史变更

3. 任务与巡检主流程
- 教师创建周期或一次性巡检任务
- 学生移动端完成签到、表单、拍照上传与提交
- 教师审核：通过 / 驳回 / 要求整改

4. AI 对比（MVP 级）
- 当前照片与同房间历史基准图对比
- 识别杂物/积水与资产增减的粗粒度变化
- 输出置信度与差异摘要到审核页

5. 预警与归档
- 覆盖逾期、异常、审核事件
- 第一阶段仅做站内通知（短信/企业微信/钉钉放到第二阶段）

## B. 建议目录结构（单仓库）
- frontend/
  - apps/mobile-web
  - apps/admin-web
  - packages/shared-types
- backend/
  - app/api
  - app/models
  - app/services
  - app/jobs
  - app/policies
  - migrations
- ai/
  - pipelines
  - models
  - evaluators
- docs/

## C. 12 周单人推进计划
第 1-2 周：基础设施期
- 完成鉴权、RBAC、弱电间、资产、二维码生成
- 完成数据库迁移与种子数据

第 3-4 周：巡检核心期
- 完成任务创建与分配
- 完成移动端表单、签到、照片上传、提交校验
- 完成教师审核流程

第 5-6 周：权限加固期
- 以 ABAC 强化女寝约束，覆盖：
  - 列表查询
  - 详情查询
  - 任务分配
  - 提交接口
- 为每次拦截写入审计日志

第 7-8 周：AI MVP 期
- 每个房间的基准图管理
- 差异计算流程与报告持久化
- 教师人工修正 AI 结果并留痕

第 9-10 周：闭环与工单期
- 异常派单、进度更新、完结佐证
- 工单闭环后联动资产状态

第 11 周：性能与可靠性期
- 弱网上传重试
- 前端 7 天缓存策略
- 队列重试与死信处理

第 12 周：验收与加固期
- 报表导出（Excel/PDF）
- 安全检查、操作日志、备份脚本

## D. MVP 最小接口集
- POST /auth/login
- GET /tasks/my
- POST /checkin
- POST /inspections
- GET /inspections/{id}
- POST /inspections/{id}/review
- POST /rooms/{id}/qrcode
- GET /rooms/{id}/assets
- POST /workorders
- GET /dashboard/overview

## E. 测试优先级（不可跳过）
1. 权限测试
- 男性用户不能读写 dorm-2/4/7 相关数据
- 教师不能把 dorm-2/4/7 任务分配给男性学生

2. 流程测试
- 前端置灰规则必须在后端再次校验
- 驳回后的记录只能在教师动作后重新提交

3. 数据一致性测试
- 水印元数据不可篡改
- 资产状态变更必须完整留痕

## F. 单人执行规则
- 每个功能分支控制在 2 天以内
- 每次合并至少带 1 条 API 测试
- 站内通知稳定前，不接短信/企业微信/钉钉
- 每周固定产出可演示版本
