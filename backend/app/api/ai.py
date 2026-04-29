# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.deps import get_current_user
from app.models.entities import User
from app.schemas.ai import AiProxyChatRequest, AiProxyChatResponse

router = APIRouter()


def _extract_text(payload: object) -> str:
    if isinstance(payload, dict):
        if payload.get("choices") and isinstance(payload["choices"], list):
            first = payload["choices"][0]
            if isinstance(first, dict):
                message = first.get("message")
                if isinstance(message, dict) and message.get("content"):
                    return str(message["content"])

        if payload.get("output_text"):
            return str(payload["output_text"])

        output = payload.get("output")
        if isinstance(output, list) and output:
            output_item = output[0]
            if isinstance(output_item, dict):
                content = output_item.get("content")
                if isinstance(content, list) and content:
                    content_item = content[0]
                    if isinstance(content_item, dict) and content_item.get("text"):
                        return str(content_item["text"])

    return json.dumps(payload, ensure_ascii=False, indent=2)


@router.post("/proxy/chat", response_model=AiProxyChatResponse)
async def proxy_chat(
    payload: AiProxyChatRequest,
    current_user: User = Depends(get_current_user),
) -> AiProxyChatResponse:
    api_key = (payload.api_key or "").strip() or settings.ai_provider_api_key.strip()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AI API key is missing")

    request_body = {
        "model": payload.model,
        "temperature": payload.temperature,
        "messages": [
            *(
                [{"role": "system", "content": payload.system_prompt.strip()}]
                if payload.system_prompt.strip()
                else []
            ),
            {"role": "user", "content": payload.user_prompt},
        ],
    }

    timeout = httpx.Timeout(settings.ai_proxy_timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.post(
                str(payload.endpoint),
                json=request_body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
            )
        except httpx.ConnectError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"无法连接 AI 服务（ConnectError）：{exc}。请检查服务器是否能访问 {payload.endpoint}",
            ) from exc
        except httpx.TimeoutException as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"AI 服务请求超时（{settings.ai_proxy_timeout_seconds}s）：{exc}",
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"AI upstream request failed: {type(exc).__name__}: {exc}",
            ) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"AI 请求异常（{type(exc).__name__}）：{exc}",
            ) from exc

    try:
        data = response.json()
    except ValueError:
        data = response.text

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "provider_status": response.status_code,
                "provider_error": data,
            },
        )

    return AiProxyChatResponse(
        provider_status=response.status_code,
        text=_extract_text(data),
        raw=data,
    )

