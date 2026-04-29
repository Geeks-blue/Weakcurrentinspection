import hashlib
import time
import uuid

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings

router = APIRouter()

_token_cache: dict = {"token": "", "expires_at": 0.0}
_ticket_cache: dict = {"ticket": "", "expires_at": 0.0}


async def _get_access_token() -> str:
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"]:
        return _token_cache["token"]
    if not settings.wechat_appid or not settings.wechat_appsecret:
        raise HTTPException(status_code=503, detail="WeChat AppID/AppSecret not configured")
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://api.weixin.qq.com/cgi-bin/token",
            params={"grant_type": "client_credential", "appid": settings.wechat_appid, "secret": settings.wechat_appsecret},
        )
        data = resp.json()
    if "access_token" not in data:
        raise HTTPException(status_code=502, detail=f"WeChat token error: {data}")
    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + data.get("expires_in", 7200) - 300
    return _token_cache["token"]


async def _get_jsapi_ticket() -> str:
    now = time.time()
    if _ticket_cache["ticket"] and now < _ticket_cache["expires_at"]:
        return _ticket_cache["ticket"]
    token = await _get_access_token()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://api.weixin.qq.com/cgi-bin/ticket/getticket",
            params={"access_token": token, "type": "jsapi"},
        )
        data = resp.json()
    if "ticket" not in data:
        raise HTTPException(status_code=502, detail=f"WeChat ticket error: {data}")
    _ticket_cache["ticket"] = data["ticket"]
    _ticket_cache["expires_at"] = now + data.get("expires_in", 7200) - 300
    return _ticket_cache["ticket"]


@router.get("/jssdk-config")
async def jssdk_config(url: str = Query(..., description="当前页面完整 URL（不含 # 部分）")):
    ticket = await _get_jsapi_ticket()
    noncestr = uuid.uuid4().hex
    timestamp = int(time.time())
    sign_str = f"jsapi_ticket={ticket}&noncestr={noncestr}&timestamp={timestamp}&url={url}"
    signature = hashlib.sha1(sign_str.encode("utf-8")).hexdigest()
    return {
        "appId": settings.wechat_appid,
        "timestamp": timestamp,
        "nonceStr": noncestr,
        "signature": signature,
    }
