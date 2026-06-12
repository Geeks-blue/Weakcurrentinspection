import logging
import time
from dataclasses import dataclass
from datetime import datetime

import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

_token_cache: dict[str, str | float] = {"token": "", "expires_at": 0.0}


@dataclass
class NotificationResult:
    sent: bool
    message: str


def send_task_assignment_notification(
    *,
    openid: str | None,
    task_title: str,
    room_label: str,
    due_at: datetime,
    assigner_name: str,
) -> NotificationResult:
    if not openid:
        return NotificationResult(
            sent=False, message="学生未绑定公众号 OpenID，未发送通知"
        )
    if not settings.wechat_task_template_id:
        return NotificationResult(
            sent=False, message="未配置 WECHAT_TASK_TEMPLATE_ID，未发送通知"
        )
    if not settings.wechat_appid or not settings.wechat_appsecret:
        return NotificationResult(
            sent=False, message="未配置 WECHAT_APPID/WECHAT_APPSECRET，未发送通知"
        )

    try:
        access_token = _get_access_token()
        payload = _build_template_payload(
            openid=openid,
            task_title=task_title,
            room_label=room_label,
            due_at=due_at,
            assigner_name=assigner_name,
        )
        with httpx.Client(timeout=8) as client:
            resp = client.post(
                "https://api.weixin.qq.com/cgi-bin/message/template/send",
                params={"access_token": access_token},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        logger.warning("WeChat task notification request failed: %s", exc)
        return NotificationResult(sent=False, message="公众号通知请求失败")

    if data.get("errcode") != 0:
        logger.warning("WeChat task notification API returned error: %s", data)
        errmsg = data.get("errmsg") or "公众号通知发送失败"
        return NotificationResult(sent=False, message=str(errmsg))

    return NotificationResult(sent=True, message="公众号通知已发送")


def _get_access_token() -> str:
    now = time.time()
    token = str(_token_cache["token"])
    expires_at = float(_token_cache["expires_at"])
    if token and now < expires_at:
        return token
    if not settings.wechat_appid or not settings.wechat_appsecret:
        raise httpx.HTTPError("WeChat AppID/AppSecret not configured")

    with httpx.Client(timeout=8) as client:
        resp = client.get(
            "https://api.weixin.qq.com/cgi-bin/token",
            params={
                "grant_type": "client_credential",
                "appid": settings.wechat_appid,
                "secret": settings.wechat_appsecret,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    if "access_token" not in data:
        raise httpx.HTTPError(f"WeChat token error: {data}")

    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + data.get("expires_in", 7200) - 300
    return str(_token_cache["token"])


def _build_template_payload(
    *,
    openid: str,
    task_title: str,
    room_label: str,
    due_at: datetime,
    assigner_name: str,
) -> dict:
    payload: dict = {
        "touser": openid,
        "template_id": settings.wechat_task_template_id,
        "data": {
            "first": {"value": "你有新的弱电巡检任务，请及时处理。"},
            "keyword1": {"value": task_title[:20]},
            "keyword2": {"value": room_label[:20]},
            "keyword3": {"value": _format_datetime(due_at)},
            "keyword4": {"value": assigner_name[:20]},
            "remark": {"value": "请进入小程序查看任务详情并按时完成巡检。"},
        },
    }
    if settings.wechat_task_notify_url:
        payload["url"] = settings.wechat_task_notify_url
    if settings.wechat_task_miniprogram_appid:
        payload["miniprogram"] = {
            "appid": settings.wechat_task_miniprogram_appid,
            "pagepath": settings.wechat_task_miniprogram_pagepath
            or "pages/student/tasks/tasks",
        }
    return payload


def _format_datetime(value: datetime) -> str:
    return value.strftime("%Y-%m-%d %H:%M")
