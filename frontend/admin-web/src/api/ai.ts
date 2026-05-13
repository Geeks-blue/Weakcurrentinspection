// 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | any[];
}

export interface AiRequestInput {
  mode: "backend_proxy" | "direct";
  backendBaseUrl: string;
  accessToken: string;
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  images?: string[];
  messages?: ChatMessage[];
}

export interface AiResponseOutput {
  raw: unknown;
  text: string;
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, "").trim())
    .replace(/^#{1,6}\s+(.*)$/gm, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractJsonArray<T = unknown>(text: string): T[] | null {
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const codeMatch = stripped.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  if (codeMatch) {
    try { return JSON.parse(codeMatch[1]) as T[]; } catch { /* fall through */ }
  }
  const arrayMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]) as T[]; } catch { /* fall through */ }
  }
  return null;
}

function extractText(payload: any): string {
  if (payload?.choices?.[0]?.message?.content) {
    return String(payload.choices[0].message.content);
  }

  if (payload?.output_text) {
    return String(payload.output_text);
  }

  if (Array.isArray(payload?.output) && payload.output[0]?.content?.[0]?.text) {
    return String(payload.output[0].content[0].text);
  }

  return JSON.stringify(payload, null, 2);
}

async function parseResponse(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw_text: text };
  }
}

function is502orTimeout(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message;
  return msg.includes("502") || msg.includes("timeout") || msg.includes("超时") || msg.includes("Timeout");
}

async function callDirect(input: AiRequestInput): Promise<AiResponseOutput> {
  const endpoint = input.endpoint.trim();
  if (!endpoint) {
    throw new Error("请填写 AI 接口地址。");
  }

  let messages: any[];
  if (input.messages) {
    messages = input.messages;
  } else {
    const userContent = input.images?.length
      ? [
          { type: "text", text: input.userPrompt },
          ...input.images.map(img => ({ type: "image_url", image_url: { url: img } }))
        ]
      : input.userPrompt;
    messages = [
      ...(input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : []),
      { role: "user", content: userContent }
    ];
  }

  const body = {
    model: input.model,
    temperature: input.temperature,
    messages
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(`AI 接口调用失败：${response.status} ${JSON.stringify(data)}`);
  }

  return { raw: data, text: extractText(data) };
}

async function callByBackendProxy(input: AiRequestInput): Promise<AiResponseOutput> {
  if (!input.accessToken) {
    throw new Error("后端代理模式需要先登录。");
  }

  const body: Record<string, unknown> = {
    endpoint: input.endpoint,
    api_key: input.apiKey,
    model: input.model,
    system_prompt: input.systemPrompt,
    user_prompt: input.userPrompt,
    temperature: input.temperature,
    images: input.images ?? []
  };
  if (input.messages) {
    body.messages = input.messages;
  }

  const response = await fetch(`${input.backendBaseUrl}/ai/proxy/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`
    },
    body: JSON.stringify(body)
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(`AI 代理调用失败：${response.status} ${JSON.stringify(data)}`);
  }

  return { raw: data, text: extractText(data) };
}

export async function callAiGateway(input: AiRequestInput): Promise<AiResponseOutput> {
  const fn = input.mode === "backend_proxy" ? callByBackendProxy : callDirect;
  try {
    return await fn(input);
  } catch (e) {
    if (is502orTimeout(e)) {
      await new Promise<void>(r => setTimeout(r, 3000));
      return fn(input);
    }
    throw e;
  }
}
