// 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
import type { AiGatewayConfig } from "./types";

const AI_CONFIG_KEY = "wc.ai.gateway.config";

export function loadAiConfig(): AiGatewayConfig {
  const cached = localStorage.getItem(AI_CONFIG_KEY);
  if (!cached) {
    return {
      mode: "backend_proxy",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "",
      model: "gpt-4o-mini",
      systemPrompt: "你是校园弱电巡检分析助手，请输出结构化风险结论。"
    };
  }

  try {
    const parsed = JSON.parse(cached) as AiGatewayConfig;
    return {
      mode: parsed.mode || "backend_proxy",
      endpoint: parsed.endpoint || "https://api.openai.com/v1/chat/completions",
      apiKey: parsed.apiKey || "",
      model: parsed.model || "gpt-4o-mini",
      systemPrompt: parsed.systemPrompt || "你是校园弱电巡检分析助手，请输出结构化风险结论。"
    };
  } catch {
    return {
      mode: "backend_proxy",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "",
      model: "gpt-4o-mini",
      systemPrompt: "你是校园弱电巡检分析助手，请输出结构化风险结论。"
    };
  }
}

export function saveAiConfig(config: AiGatewayConfig): void {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
}

