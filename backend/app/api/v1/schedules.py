"""自动内容生成调度规则 API

CRUD + toggle + run-now，挂载在 /generation/schedules 前缀下。
"""
from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import NotFoundError
from app.core.time import UtcModel
from app.models.generation_schedule import GenerationSchedule
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.services.schedule_service import scheduler_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/generation/schedules", tags=["自动生成调度"])


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class ScheduleRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="规则名称")
    type: str = Field(..., description="内容类型：article / image / video")
    cron_hour: int = Field(..., ge=0, le=23, description="触发小时（0-23）")
    cron_minute: int = Field(0, ge=0, le=59, description="触发分钟（0-59）")
    cron_days_of_week: str | None = Field(
        None,
        description="触发星期，null=每天; '0'=周一; '0,2,4'=周一三五（APScheduler 0=Monday）",
    )
    timezone: str = Field("Asia/Shanghai", description="时区")
    gen_config: dict = Field(
        ...,
        description=(
            "生成配置（对齐三个生成页请求体）：{prompt, reference, skill_id, template_label, "
            "provider, model, mixed / size,count,as_dynamic,image_urls / "
            "resolution,duration,enable_audio,image_url,last_image_url}"
        ),
    )

    # 自动分发（生成完成后内置发到国内社媒）
    auto_distribute_enabled: bool = Field(False, description="是否启用自动分发")
    distribute_platform_code: str | None = Field(
        None, description="TLF 平台代码（DouYin/XiaoHongShu/...）",
    )
    distribute_account_ids: list[str] | None = Field(
        None, description="TlfAccount.id 数组（旧单平台字段，保留兼容）",
    )
    distribute_config: dict | None = Field(
        None,
        description=(
            "完整分发配置：{platforms:[code], accounts:{code:[accId]}, "
            "extras:{code:{visible_type/statement/create_type/category/sub_category}}}"
        ),
    )

    @model_validator(mode="after")
    def _check_gen_config(self) -> "ScheduleRequest":
        prompt = (self.gen_config or {}).get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("生成配置缺少提示词 prompt")
        return self

    @model_validator(mode="after")
    def _check_auto_distribute(self) -> "ScheduleRequest":
        if not self.auto_distribute_enabled:
            return self
        cfg = self.distribute_config or {}
        platforms = cfg.get("platforms") or []
        accounts = cfg.get("accounts") or {}
        if platforms:
            # 新版多平台配置：每个平台至少一个账号
            for code in platforms:
                if not accounts.get(code):
                    raise ValueError(f"开启自动分发时平台 {code} 至少选择一个账号")
        else:
            # 回退旧单平台校验
            if not self.distribute_platform_code:
                raise ValueError("开启自动分发时必须选择分发平台")
            if not self.distribute_account_ids:
                raise ValueError("开启自动分发时必须至少选择一个账号")
        return self


class ScheduleResponse(UtcModel):
    id: str
    user_id: str
    name: str
    type: str
    is_active: bool
    cron_hour: int
    cron_minute: int
    cron_days_of_week: str | None
    timezone: str
    gen_config: dict | None
    auto_distribute_enabled: bool = False
    distribute_platform_code: str | None = None
    distribute_account_ids: list[str] | None = None
    distribute_config: dict | None = None
    last_run_at: datetime | None
    next_run_at: datetime | None
    run_count: int
    last_status: str | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def _legacy_from_config(
    cfg: dict | None,
    fallback_code: str | None,
    fallback_ids: list[str] | None,
) -> tuple[str | None, list[str] | None]:
    """从新版 distribute_config 派生旧单平台字段（列表卡片展示用）；无 config 时用回退值。"""
    if cfg and cfg.get("platforms"):
        first = cfg["platforms"][0]
        accounts = (cfg.get("accounts") or {}).get(first) or None
        return first, accounts
    return fallback_code, fallback_ids


def _enrich_next_run(resp: ScheduleResponse, schedule_id: str) -> ScheduleResponse:
    """从 APScheduler 读取最新的 next_run_time 覆盖 DB 值（更实时）。"""
    nrt = scheduler_service.get_next_run_time(schedule_id)
    if nrt:
        resp.next_run_at = nrt
    return resp


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_schedules(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    type: str | None = Query(None, description="过滤内容类型"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出当前用户的所有调度规则（分页）。"""
    base_q = select(GenerationSchedule).where(GenerationSchedule.user_id == current_user.id)
    if type:
        base_q = base_q.where(GenerationSchedule.type == type)

    total_q = select(func.count()).select_from(base_q.subquery())
    total: int = (await db.execute(total_q)).scalar_one()

    items_q = (
        base_q.order_by(GenerationSchedule.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    schedules = (await db.execute(items_q)).scalars().all()

    items = [
        _enrich_next_run(ScheduleResponse.model_validate(s), s.id)
        for s in schedules
    ]
    return success(
        data=PaginatedData.create(
            items=[i.model_dump() for i in items],
            total=total,
            page=page,
            page_size=page_size,
        )
    )


@router.post("")
async def create_schedule(
    body: ScheduleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建新调度规则。"""
    schedule = GenerationSchedule(
        user_id=current_user.id,
        name=body.name,
        type=body.type,
        is_active=True,
        cron_hour=body.cron_hour,
        cron_minute=body.cron_minute,
        cron_days_of_week=body.cron_days_of_week,
        timezone=body.timezone,
        gen_config=body.gen_config,
        auto_distribute_enabled=body.auto_distribute_enabled,
        distribute_config=body.distribute_config,
        run_count=0,
    )
    schedule.distribute_platform_code, schedule.distribute_account_ids = _legacy_from_config(
        body.distribute_config, body.distribute_platform_code, body.distribute_account_ids,
    )
    db.add(schedule)
    await db.flush()
    await db.commit()
    await db.refresh(schedule)  # 拉取 server_default 字段（created_at / updated_at）

    scheduler_service.add_job(schedule)

    resp = _enrich_next_run(ScheduleResponse.model_validate(schedule), schedule.id)
    return success(data=resp.model_dump())


@router.get("/{id}")
async def get_schedule(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取单条调度规则详情。"""
    schedule = await _fetch_owned(id, current_user.id, db)
    resp = _enrich_next_run(ScheduleResponse.model_validate(schedule), schedule.id)
    return success(data=resp.model_dump())


@router.put("/{id}")
async def update_schedule(
    id: str,
    body: ScheduleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新调度规则（触发时间或生成参数）。"""
    schedule = await _fetch_owned(id, current_user.id, db)

    schedule.name = body.name
    schedule.type = body.type
    schedule.cron_hour = body.cron_hour
    schedule.cron_minute = body.cron_minute
    schedule.cron_days_of_week = body.cron_days_of_week
    schedule.timezone = body.timezone
    schedule.gen_config = body.gen_config
    schedule.auto_distribute_enabled = body.auto_distribute_enabled
    schedule.distribute_config = body.distribute_config
    schedule.distribute_platform_code, schedule.distribute_account_ids = _legacy_from_config(
        body.distribute_config, body.distribute_platform_code, body.distribute_account_ids,
    )

    await db.flush()
    await db.commit()
    await db.refresh(schedule)  # 拉取 server_default 字段（updated_at）

    scheduler_service.update_job(schedule)

    resp = _enrich_next_run(ScheduleResponse.model_validate(schedule), schedule.id)
    return success(data=resp.model_dump())


@router.delete("/{id}")
async def delete_schedule(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除调度规则。"""
    schedule = await _fetch_owned(id, current_user.id, db)
    scheduler_service.remove_job(schedule.id)
    await db.delete(schedule)
    # 显式 commit 后再返回，否则前端收到响应后立刻发起的列表 GET 会走另一条连接读到未提交的旧数据
    await db.commit()
    return success(message="已删除")


@router.patch("/{id}/toggle")
async def toggle_schedule(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """切换启用/禁用状态。"""
    schedule = await _fetch_owned(id, current_user.id, db)
    schedule.is_active = not schedule.is_active
    await db.flush()
    await db.commit()
    await db.refresh(schedule)  # 拉取 server_default 字段（updated_at）

    scheduler_service.update_job(schedule)

    resp = _enrich_next_run(ScheduleResponse.model_validate(schedule), schedule.id)
    return success(data=resp.model_dump())


@router.post("/{id}/run-now")
async def run_now(
    id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """立即触发一次（不影响定期调度）。"""
    schedule = await _fetch_owned(id, current_user.id, db)
    background_tasks.add_task(scheduler_service.run_now, schedule.id)
    return success(message="已触发，内容稍后写入内容库")


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _fetch_owned(
    schedule_id: str, user_id: str, db: AsyncSession
) -> GenerationSchedule:
    result = await db.execute(
        select(GenerationSchedule).where(
            GenerationSchedule.id == schedule_id,
            GenerationSchedule.user_id == user_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise NotFoundError("调度规则不存在")
    return schedule
