// 管理端前端配置
// 后端地址和移动端地址均从当前页面协议和主机名动态推导，
// 这样在 HTTP 和 HTTPS 环境下都能自动适配。
export interface FrontendConfig {
  backendBaseUrl: string;   // 后端 API 基础地址
  mobileWebUrl: string;     // 移动端网页地址（用于学生跳转）
  aiDefaultEndpoint: string;
  aiDefaultModel: string;
}

/**
 * 根据当前页面的 protocol 和 hostname 拼接指定端口的地址。
 * 例如访问 https://192.168.1.1 时，port=18000 → https://192.168.1.1:18000
 */
function resolveHostPort(port: number): string {
  const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
  const hostname = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  return `${protocol}//${hostname}:${port}`;
}

function readBuildEnv(name: string): string {
  const value = import.meta.env[name];
  return typeof value === "string" ? value.trim().replace(/\/$/, "") : "";
}

export const frontendConfig: FrontendConfig = {
  backendBaseUrl: readBuildEnv("VITE_BACKEND_BASE_URL") || resolveHostPort(18000),
  mobileWebUrl: readBuildEnv("VITE_MOBILE_WEB_URL") || resolveHostPort(5174),
  aiDefaultEndpoint: readBuildEnv("VITE_AI_DEFAULT_ENDPOINT") || "https://api.openai.com/v1/chat/completions",
  aiDefaultModel: readBuildEnv("VITE_AI_DEFAULT_MODEL") || "gpt-4o-mini"
};
