// 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
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
}

export interface AiResponseOutput {
  raw: unknown;
  text: string;
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

async function callDirect(input: AiRequestInput): Promise<AiResponseOutput> {
  const endpoint = input.endpoint.trim();
  if (!endpoint) {
    throw new Error("请填写 AI 接口地址。");
  }

  const userContent = input.images?.length
    ? [
        { type: "text", text: input.userPrompt },
        ...input.images.map(img => ({ type: "image_url", image_url: { url: img } }))
      ]
    : input.userPrompt;

  const body = {
    model: input.model,
    temperature: input.temperature,
    messages: [
      ...(input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : []),
      { role: "user", content: userContent }
    ]
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

  return {
    raw: data,
    text: extractText(data)
  };
}

async function callByBackendProxy(input: AiRequestInput): Promise<AiResponseOutput> {
  if (!input.accessToken) {
    throw new Error("后端代理模式需要先登录。");
  }

  const response = await fetch(`${input.backendBaseUrl}/ai/proxy/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`
    },
    body: JSON.stringify({
      endpoint: input.endpoint,
      api_key: input.apiKey,
      model: input.model,
      system_prompt: input.systemPrompt,
      user_prompt: input.userPrompt,
      temperature: input.temperature,
      images: input.images ?? []
    })
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(`AI 代理调用失败：${response.status} ${JSON.stringify(data)}`);
  }

  return {
    raw: data,
    text: extractText(data)
  };
}

export async function callAiGateway(input: AiRequestInput): Promise<AiResponseOutput> {
  if (input.mode === "backend_proxy") {
    return callByBackendProxy(input);
  }

  return callDirect(input);
}

