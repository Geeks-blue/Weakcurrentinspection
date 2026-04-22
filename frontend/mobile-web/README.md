# 移动端前端说明

当前移动端页面已支持：
- 学生账号登录
- 查询个人待巡检任务
- 填写巡检结构化表单并提交
- 查询个人巡检记录

## 1. 安装依赖
npm install

## 2. 启动
npm run dev

默认地址：http://127.0.0.1:5174

## 3. 当前实现范围
- 必填校验：任务、定位经纬度、检查项、至少 1 张照片
- 照片数量限制：1-5 张（使用照片 Key 文本模拟）
- 手动签到校验：选择手动补录时，必须填写手动房间编号和门牌照片 Key

## 4. 已接通后端接口
- POST /auth/login
- GET /tasks/my
- POST /inspections/submit
- GET /inspections/my

## 5. 联调建议账号
- student_f01 / Student@123
- student_m01 / Student@123

说明：后端启动后会自动创建演示任务，便于移动端直接联调提交流程。
