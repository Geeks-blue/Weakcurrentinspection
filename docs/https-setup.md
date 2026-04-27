# HTTPS 配置指南

本项目在局域网/校园网环境下启用 HTTPS，需要：
1. 用 **mkcert** 生成本地可信证书
2. 将根 CA 证书导入到 iPhone/iPad 的信任列表
3. 启动 Nginx（Docker Compose）和带 SSL 的 FastAPI

---

## 第一步：在服务器上安装 mkcert

### Linux（Ubuntu/Debian）

```bash
# 安装 libnss3-tools（Firefox 需要，可选）
sudo apt-get install -y libnss3-tools

# 下载 mkcert 最新版
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert

# 初始化本地 CA
mkcert -install
```

### macOS（在服务器上操作时）

```bash
brew install mkcert
mkcert -install
```

---

## 第二步：生成服务器证书

将 `192.168.x.x` 替换为服务器的**实际局域网 IP 地址**（`ip addr` 或 `ifconfig` 查看）。

```bash
cd /path/to/weakcurrentinspection/nginx/ssl

# 生成证书（同时覆盖 IP 和 localhost）
mkcert -key-file server.key -cert-file server.crt 192.168.x.x localhost 127.0.0.1
```

执行后 `nginx/ssl/` 目录中会出现：
- `server.crt` — 服务器证书
- `server.key` — 私钥

> ⚠️ `server.key` 是私钥，请勿提交到版本库。`.gitignore` 已排除 `nginx/ssl/*.key` 和 `nginx/ssl/*.crt`。

---

## 第三步：找到根 CA 证书文件（需发送到手机）

mkcert 的根 CA 文件路径：

```bash
mkcert -CAROOT
# 输出类似：/root/.local/share/mkcert
```

进入该目录，找到 `rootCA.pem`：

```bash
ls $(mkcert -CAROOT)
# rootCA.pem  rootCA-key.pem
```

将 `rootCA.pem` 复制到一个可下载的位置，或直接发送给手机用户。

---

## 第四步：在 iPhone / iPad 上导入 CA 证书

### 4.1 把 rootCA.pem 传到手机

方法一（AirDrop）：
```
在 Mac 上 AirDrop → 接受
```

方法二（微信/钉钉）：把 `rootCA.pem` 改名为 `rootCA.crt` 后发送给自己，手机下载。

方法三（局域网 HTTP 下载）：
```bash
# 在服务器上临时开 HTTP 分享（仅局域网）
cd $(mkcert -CAROOT)
python3 -m http.server 9999
```
然后在 iPhone Safari 访问 `http://192.168.x.x:9999/rootCA.pem`。

### 4.2 安装描述文件

1. 手机接收到文件后，弹出提示"已下载描述文件"
2. 进入 **设置 → 通用 → VPN与设备管理**
3. 在"已下载描述文件"下点击 **mkcert development CA**
4. 右上角点击 **安装** → 输入手机密码 → 点击**安装**

### 4.3 信任根证书

> **必做！** 安装完还需要手动信任，否则 Safari 仍会报不受信任。

1. 进入 **设置 → 通用 → 关于本机 → 证书信任设置**
2. 找到 **mkcert development CA** 开关，打开
3. 弹出确认框 → 点击**继续**

完成后 Safari 访问 `https://192.168.x.x` 不再报证书警告，定位授权弹窗正常弹出。

---

## 第五步：构建前端

```bash
# 构建管理端
cd frontend/admin-web
npm run build          # 产物在 frontend/admin-web/dist/

# 构建移动端
cd frontend/mobile-web
npm run build          # 产物在 frontend/mobile-web/dist/
```

---

## 第六步：启动 Nginx（Docker）

```bash
# 在项目根目录
docker compose up -d nginx
```

Nginx 将在以下端口提供 HTTPS 服务：
| 地址 | 用途 |
|------|------|
| `https://192.168.x.x` （443） | 管理端 |
| `https://192.168.x.x:5174` | 移动端 |
| `http://192.168.x.x` （80） | 自动跳转 HTTPS |

---

## 第七步：以 HTTPS 模式启动 FastAPI

FastAPI（uvicorn）使用与 Nginx 相同的证书文件：

```bash
uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 18000 \
  --ssl-keyfile nginx/ssl/server.key \
  --ssl-certfile nginx/ssl/server.crt
```

---

## 第八步：更新 CORS 配置

编辑 `.env` 文件，将服务器实际 IP 加入 `CORS_ALLOW_ORIGINS`：

```env
CORS_ALLOW_ORIGINS=https://192.168.x.x,https://192.168.x.x:5174
```

重启后端后生效。

---

## 常见问题

**Q: iPhone 上 Safari 仍然提示"不受信任"？**
A: 确认完成了第四步的「信任根证书」步骤（设置 → 通用 → 关于本机 → 证书信任设置）。

**Q: 证书只对某个 IP 有效，换台电脑访问报错？**
A: 用新 IP 重新执行第二步的 `mkcert` 命令生成新证书，替换 `nginx/ssl/` 目录中的文件，重启 Nginx 和 FastAPI。

**Q: 服务器 IP 变了怎么办？**
A: 同上，重新生成证书；根 CA 不需要重新导入手机。
