// 移动端前端配置
// 后端地址从当前页面协议和主机名动态推导，HTTP/HTTPS 环境自动适配。
export interface MobileFrontendConfig {
  backendBaseUrl: string;  // 后端 API 基础地址
}

/**
 * 根据当前页面的 protocol 和 hostname 拼接指定端口的地址。
 * 例如访问 https://192.168.1.1:5174 时，port=18000 → https://192.168.1.1:18000
 */
function resolveHostPort(port: number): string {
  const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
  const hostname = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  return `${protocol}//${hostname}:${port}`;
}

export const mobileFrontendConfig: MobileFrontendConfig = {
  backendBaseUrl: resolveHostPort(18000)  // 后端监听端口
};

