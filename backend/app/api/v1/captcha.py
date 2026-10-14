from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.schemas.common import success
from app.services import captcha_service

router = APIRouter(prefix="/captcha", tags=["人机验证"])


def _client_ip(request: Request) -> str | None:
    """优先取反代真实 IP（与 rate_limit 中间件一致）。"""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    return request.client.host if request.client else None


@router.get("/slider")
async def get_slider():
    """获取一道滑块拼图题。"""
    return success(data=await captcha_service.generate_slider())


class VerifySliderRequest(BaseModel):
    captchaId: str = Field(..., min_length=1, max_length=64)
    x: int = Field(..., ge=0, le=2000, description="滑块水平位移（px）")


@router.post("/verify")
async def verify_slider(body: VerifySliderRequest, request: Request):
    """校验滑块，通过返回一次性 ticket。"""
    ticket = await captcha_service.verify_slider(body.captchaId, body.x, _client_ip(request))
    return success(data={"ticket": ticket})
