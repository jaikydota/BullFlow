from __future__ import annotations

from pydantic import BaseModel, Field


class TrackEventIn(BaseModel):
    """单条埋点上报体（前端 trackEvent 组装）。"""

    event_name: str = Field(..., max_length=64, description="事件名")
    visitor_id: str = Field(..., max_length=64, description="匿名访客 ID（前端持久化生成）")
    session_id: str | None = Field(None, max_length=64)
    page_url: str | None = Field(None, max_length=1024)
    referrer: str | None = Field(None, max_length=1024)
    properties: dict | None = Field(None, description="事件详情键值")
    # 客户端时间戳（可选，服务端仍以入库时间为准，仅备查）
    ts: str | None = Field(None, max_length=40)


class TrackBatchIn(BaseModel):
    """批量埋点上报体（前端队列 flush 时使用）。"""

    events: list[TrackEventIn] = Field(..., min_length=1, max_length=50)
