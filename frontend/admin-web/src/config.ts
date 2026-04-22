// 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
// 前端固定配置：统一管理地址，避免在界面暴露后端地址输入。
export interface FrontendConfig {
  backendBaseUrl: string;
  mobileWebUrl: string;
}

export const frontendConfig: FrontendConfig = {
  backendBaseUrl: "http://192.168.18.102:18000",
  mobileWebUrl: "http://192.168.18.102:5174"
};

