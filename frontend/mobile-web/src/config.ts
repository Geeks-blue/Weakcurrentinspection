// 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
// 前端固定配置：移动端通过配置文件读取后端地址，不在界面上暴露。
export interface MobileFrontendConfig {
  backendBaseUrl: string;
}

function resolveHostPort(port: number): string {
  const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
  const hostname = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  return `${protocol}//${hostname}:${port}`;
}

export const mobileFrontendConfig: MobileFrontendConfig = {
  backendBaseUrl: resolveHostPort(18000)
};

