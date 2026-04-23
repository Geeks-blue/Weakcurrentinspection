// 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
// 前端固定配置：统一管理地址，避免在界面暴露后端地址输入。
export interface FrontendConfig {
  backendBaseUrl: string;
  mobileWebUrl: string;
}

function resolveHostPort(port: number): string {
  const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
  const hostname = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  return `${protocol}//${hostname}:${port}`;
}

export const frontendConfig: FrontendConfig = {
  backendBaseUrl: resolveHostPort(18000),
  mobileWebUrl: resolveHostPort(5174)
};

