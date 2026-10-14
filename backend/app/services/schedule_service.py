"""自动内容生成调度服务

使用 APScheduler AsyncIOScheduler 在 FastAPI 进程内运行 cron 定时任务。
规则持久化在 MySQL（generation_schedules 表），应用启动时从 DB 重新注册。
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from app.core.time import utcnow

# cron 触发时区：用户配置的定时是北京时间，CronTrigger 必须用 Asia/Shanghai（勿改）
_CST = ZoneInfo("Asia/Shanghai")

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

if TYPE_CHECKING:
    from app.models.generation_schedule import GenerationSchedule

logger = logging.getLogger(__name__)


_TYPE_LABEL = {"article": "文章", "image": "图片", "video": "视频"}


async def _notify(
    *,
    user_id: str,
    type: str,
    title: str,
    message: str | None = None,
    link_url: str | None = None,
    extra: dict | None = None,
) -> None:
    """cron 内安全发通知：新建独立 session，失败仅日志不抛。"""
    from app.core.database import async_session_factory
    from app.services.notification_service import create_notification

    try:
        async with async_session_factory() as db:
            await create_notification(
                db,
                user_id=user_id,
                type=type,
                title=title,
                message=message,
                link_url=link_url,
                extra=extra,
            )
            await db.commit()
    except Exception as e:  # noqa: BLE001
        logger.warning("[Scheduler] notify failed: %s", e)


async def _run_scheduled_job(schedule_id: str, *, manual: bool = False) -> None:
    """生成执行函数（cron 定时触发 或「立刻执行」手动触发）。

    manual=True（立刻执行）时**绕过 is_active 门禁**：is_active 只控制 cron 是否自动触发，
    用户手动点「立刻执行」是显式意图，停用中的规则也应执行一次（否则前端提示「已触发」但
    实际啥也没生成，误导用户）。
    """
    from app.core.database import async_session_factory
    from app.models.generation_schedule import GenerationSchedule
    from app.models.generated_content import GeneratedContent
    from sqlalchemy import select

    logger.info("[Scheduler] Job triggered | schedule_id=%s manual=%s", schedule_id, manual)

    cfg: dict = {}
    provider = "doubao"
    content_type = "article"
    ref_text: str | None = None
    use_knowledge = False
    async with async_session_factory() as db:
        result = await db.execute(
            select(GenerationSchedule).where(GenerationSchedule.id == schedule_id)
        )
        schedule = result.scalar_one_or_none()
        if not schedule:
            logger.warning("[Scheduler] schedule %s not found, skipping", schedule_id)
            return
        if not manual and not schedule.is_active:
            logger.info("[Scheduler] schedule %s is inactive, skipping", schedule_id)
            return

        cfg = schedule.gen_config or {}
        provider = cfg.get("provider") or "doubao"
        content_type = schedule.type
        # 解析「参考内容」：文章允许 auto 模式检索文档，图片/视频仅注入企业档案
        from app.services.reference_resolver import resolve_generation_reference
        resolved = await resolve_generation_reference(
            cfg.get("reference"), schedule.user_id, db,
            allow_doc_retrieval=(content_type == "article"),
            fallback_brand_info=None,
        )
        ref_text = resolved.reference_text or None
        use_knowledge = resolved.use_knowledge
        # 解析 skill 提示词（注入生成）
        from app.services.skill_service import get_skill_prompt
        skill_prompt = await get_skill_prompt(cfg.get("skill_id"), db)

    # 生成配置里的提示词即有效提示词（不加平台前缀）；参考内容由各生成函数按类型注入
    effective_prompt = (cfg.get("prompt") or "").strip()

    # 触发即计数 + 置「执行中」，让前端立刻反映已触发（生成耗时长，避免误以为没执行）
    await _mark_schedule_started(schedule_id)

    record_id: str | None = None
    try:
        if content_type == "article":
            record_id = await _run_article(schedule, effective_prompt, provider, cfg, ref_text, use_knowledge, skill_prompt)
        elif content_type == "image":
            record_id = await _run_image(schedule, effective_prompt, provider, cfg, ref_text, skill_prompt)
        elif content_type == "video":
            record_id = await _run_video(schedule, effective_prompt, provider, cfg, ref_text, skill_prompt)
        else:
            logger.error("[Scheduler] Unknown type=%s for schedule=%s", content_type, schedule_id)
            return

        await _update_schedule_stats(schedule_id, status="success", error=None)
        logger.info("[Scheduler] Job completed | schedule_id=%s type=%s", schedule_id, content_type)
        # 拼接精准详情页地址；拿不到 record_id 时降级到列表页
        success_link = f"/generation/library/{record_id}" if record_id else "/generation/library"
        await _notify(
            user_id=schedule.user_id,
            type="content.generated",
            title="内容生成完成",
            message=f"您的{_TYPE_LABEL.get(content_type, '内容')}「{(schedule.name or effective_prompt)[:24]}」已生成完成",
            link_url=success_link,
            extra={
                "schedule_id": schedule_id,
                "type": content_type,
                "content_id": str(record_id) if record_id else None,
            },
        )

    except Exception as exc:
        logger.exception("[Scheduler] Job failed | schedule_id=%s error=%s", schedule_id, exc)
        await _update_schedule_stats(schedule_id, status="failed", error=str(exc)[:500])
        # 失败时若已创建 record（image/video 模式），仍能跳到该条详情查错；否则降级列表
        fail_link = f"/generation/library/{record_id}" if record_id else "/generation/library"
        await _notify(
            user_id=schedule.user_id,
            type="content.generation_failed",
            title="内容生成失败",
            message=f"您的{_TYPE_LABEL.get(content_type, '内容')}「{(schedule.name or effective_prompt)[:24]}」生成失败：{str(exc)[:100]}",
            link_url=fail_link,
            extra={
                "schedule_id": schedule_id,
                "type": content_type,
                "content_id": str(record_id) if record_id else None,
            },
        )


def _schedule_params(schedule: "GenerationSchedule", cfg: dict, extra: dict) -> dict:
    """统一组装 GeneratedContent.parameters：自动分发依赖 schedule_id。"""
    return {
        "reference": cfg.get("reference"),
        "template_label": cfg.get("template_label"),
        "schedule_id": schedule.id,
        "schedule_name": schedule.name,
        **extra,
    }


async def _run_article(
    schedule: "GenerationSchedule", prompt: str, provider: str, cfg: dict,
    ref_text: str | None = None, use_knowledge: bool = False,
    skill_prompt: str | None = None,
) -> str:
    from app.core.database import async_session_factory
    from app.models.generated_content import GeneratedContent

    model = cfg.get("model")

    # 图文混编：建 pending 记录 + 走异步混编管线（正文内嵌配图）
    if cfg.get("mixed"):
        import random
        from app.api.v1.generation import _run_mixed_article_async
        from app.core.config import settings

        _min = max(1, settings.MIXED_ARTICLE_IMAGE_MIN)
        _max = max(_min, settings.MIXED_ARTICLE_IMAGE_MAX)
        n = random.randint(_min, _max)
        async with async_session_factory() as db:
            record = GeneratedContent(
                user_id=schedule.user_id, type="article", layout="mixed",
                title=schedule.name, prompt=prompt, model_provider=provider, model_name=model,
                parameters=_schedule_params(schedule, cfg, {"mixed_image_count": n}),
                status="pending",
            )
            db.add(record)
            await db.flush()
            await db.commit()
            record_id = record.id
        await _run_mixed_article_async(
            record_id=record_id, prompt=prompt, user_id=schedule.user_id,
            provider=provider, model=model, brand_info=ref_text,
            skill_prompt=skill_prompt, use_knowledge=use_knowledge, image_count=n,
        )
        return str(record_id)

    # 普通文章：非流式直接生成入库
    from app.agents.workflows.content_workflow import run_article_workflow

    async with async_session_factory() as db:
        result = await run_article_workflow(
            prompt=prompt,
            user_id=schedule.user_id,
            db=db,
            provider=provider,
            model=model,
            brand_info=ref_text,
            skill_prompt=skill_prompt,
            use_knowledge=use_knowledge,
            stream=False,
        )

        content_text = ""
        if isinstance(result, dict):
            content_text = result.get("content", "") or ""
        elif hasattr(result, "__aiter__"):
            async for chunk in result:
                if isinstance(chunk, str) and chunk.startswith("data: "):
                    import json as _json
                    try:
                        payload = _json.loads(chunk[6:])
                        if payload.get("type") == "content":
                            content_text += payload.get("data", "")
                    except Exception:
                        pass
        else:
            content_text = str(result) if result else ""

        # 生成发布元数据（标题/描述/标签），对齐手动文章生成；失败不影响主流程
        meta: dict = {}
        try:
            from app.agents.metadata_agent import generate_publish_metadata
            meta = await generate_publish_metadata(
                content_type="article", text=content_text, brand_info=ref_text,
            )
        except Exception as meta_err:  # noqa: BLE001
            logger.warning("[Scheduler] article metadata skipped: %s", meta_err)

        record = GeneratedContent(
            user_id=schedule.user_id,
            type="article",
            # 标题优先用 LLM 生成的发布标题；失败回退规则名
            title=meta.get("title") or schedule.name,
            content=content_text,
            description=meta.get("description"),
            tags=meta.get("tags"),
            prompt=prompt,
            model_provider=provider,
            model_name=model,
            parameters=_schedule_params(schedule, cfg, {}),
            status="completed",
        )
        db.add(record)
        await db.flush()
        await db.commit()
        await db.refresh(record)
        logger.info("[Scheduler] Article saved | record_id=%s", record.id)
        record_id = str(record.id)

    # 文章完成后触发自动分发（图片/视频在各自 async helper 内部已触发）
    from app.api.v1.generation import _maybe_auto_distribute
    async with async_session_factory() as db:
        rec = await db.get(GeneratedContent, record_id)
        if rec:
            await _maybe_auto_distribute(db, rec)
    return record_id


async def _run_image(
    schedule: "GenerationSchedule", prompt: str, provider: str, cfg: dict,
    ref_text: str | None = None, skill_prompt: str | None = None,
) -> str:
    from app.api.v1.generation import _run_image_generation_async
    from app.core.database import async_session_factory
    from app.models.generated_content import GeneratedContent

    size = cfg.get("size") or "2560x1440"
    count = max(1, int(cfg.get("count") or 1))
    as_dynamic = bool(cfg.get("as_dynamic"))
    image_urls = cfg.get("image_urls") or None

    async with async_session_factory() as db:
        record = GeneratedContent(
            user_id=schedule.user_id,
            type="image",
            layout="dynamic" if as_dynamic else None,
            title=schedule.name,
            prompt=prompt,
            model_provider=provider,
            parameters=_schedule_params(schedule, cfg, {
                "size": size, "count": count, "as_dynamic": as_dynamic, "image_urls": image_urls,
            }),
            status="pending",
        )
        db.add(record)
        await db.flush()
        await db.commit()
        record_id = record.id

    await _run_image_generation_async(
        record_id=record_id,
        prompt=prompt,
        user_id=schedule.user_id,
        provider=provider,
        size=size,
        image_urls=image_urls,
        brand_info=ref_text,  # 参考内容由 _build_image_prompt 追加
        skill_prompt=skill_prompt,
        count=count,
        prefer_generated_title=True,  # 标题用 LLM 生成的，而非规则名占位
    )
    return str(record_id)


async def _run_video(
    schedule: "GenerationSchedule", prompt: str, provider: str, cfg: dict,
    ref_text: str | None = None, skill_prompt: str | None = None,
) -> str:
    from app.api.v1.generation import _run_video_generation_async
    from app.core.database import async_session_factory
    from app.models.generated_content import GeneratedContent

    resolution = cfg.get("resolution") or "720p"
    duration = int(cfg.get("duration") or 5)
    enable_audio = cfg.get("enable_audio") is not False
    image_url = cfg.get("image_url")
    last_image_url = cfg.get("last_image_url")

    async with async_session_factory() as db:
        record = GeneratedContent(
            user_id=schedule.user_id,
            type="video",
            title=schedule.name,
            prompt=prompt,
            model_provider=provider,
            parameters=_schedule_params(schedule, cfg, {
                "resolution": resolution, "duration": duration, "enable_audio": enable_audio,
                "image_url": image_url, "last_image_url": last_image_url,
            }),
            status="pending",
        )
        db.add(record)
        await db.flush()
        await db.commit()
        record_id = record.id

    await _run_video_generation_async(
        record_id=record_id,
        prompt=prompt,
        user_id=schedule.user_id,
        provider=provider,
        resolution=resolution,
        duration=duration,
        image_url=image_url,
        last_image_url=last_image_url,
        brand_info=ref_text,  # 参考内容由 _build_video_prompt 追加
        skill_prompt=skill_prompt,
        enable_audio=enable_audio,
        prefer_generated_title=True,  # 标题用 LLM 生成的，而非规则名占位
    )
    return str(record_id)


async def _run_expire_subscriptions() -> None:
    """订阅到期 cron：把过期非 free 订阅切 expired 并绑 free。"""
    from app.core.database import async_session_factory
    from app.services.saas_subscription import expire_due_subscriptions

    logger.info("[Scheduler-Billing] expire_subscriptions tick")
    try:
        async with async_session_factory() as db:
            n = await expire_due_subscriptions(db)
            await db.commit()
            if n:
                logger.info("[Scheduler-Billing] expired %d subscriptions", n)
    except Exception:
        logger.exception("[Scheduler-Billing] expire_subscriptions failed")


async def _run_expire_pending_orders() -> None:
    """订单超时 cron：pending 超时改 cancelled。"""
    from app.core.database import async_session_factory
    from app.services.saas_billing import expire_pending_orders

    try:
        async with async_session_factory() as db:
            n = await expire_pending_orders(db)
            await db.commit()
            if n:
                logger.info("[Scheduler-Billing] cancelled %d pending orders", n)
    except Exception:
        logger.exception("[Scheduler-Billing] expire_pending_orders failed")


async def _run_tlf_metrics_daily() -> None:
    """每日拉取所有 active 推量发账号的聚合指标，写入 tlf_account_metrics。"""
    from app.core.database import async_session_factory
    from app.models.tlf_account import TlfAccount
    # 通过推量发 SDK 触发采集，真实指标经 webhook(accountOverview) 异步回填
    from app.services import tlf_client
    from sqlalchemy import select

    ok, fail = 0, 0
    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(TlfAccount).where(TlfAccount.status == "active")
            )
            accounts = result.scalars().all()
            logger.info("[Scheduler-TLF] 开始触发采集 %d 个 active 账号", len(accounts))
            for account in accounts:
                try:
                    # 仅触发；指标数据由 accountOverview webhook 回填到 tlf_account_metrics
                    await tlf_client.trigger_account_overview(account.tlf_account_id)
                    ok += 1
                except Exception:
                    logger.exception(
                        "[Scheduler-TLF] 账号 %s 触发采集失败", account.tlf_account_id
                    )
                    fail += 1
    except Exception:
        logger.exception("[Scheduler-TLF] daily metrics 任务失败")
    logger.info("[Scheduler-TLF] daily metrics 完成 ok=%d fail=%d", ok, fail)


async def _run_analytics_daily() -> None:
    """埋点每日聚合 cron：统计昨天（完整）+ 今天（滚动）核心指标写入聚合表。"""
    from app.core.database import async_session_factory
    from app.services.analytics_service import aggregate_daily, beijing_today

    try:
        today = beijing_today()
        yesterday = today - timedelta(days=1)
        async with async_session_factory() as db:
            await aggregate_daily(db, yesterday)
            await aggregate_daily(db, today)
            await db.commit()
        logger.info("[Scheduler-Analytics] daily stats aggregated for %s & %s", yesterday, today)
    except Exception:
        logger.exception("[Scheduler-Analytics] daily aggregate failed")


async def _mark_schedule_started(schedule_id: str) -> None:
    """执行**开始**即记一次触发：run_count +1 / last_run_at=now / last_status=running。

    生成可能耗时数分钟，开始即计数（字段语义为「累计触发次数」）并置 running，
    前端轮询可立刻显示「执行中」，避免误以为没触发。入库统一 UTC（_CST 仅用于 cron 触发时区）。"""
    from app.core.database import async_session_factory
    from app.models.generation_schedule import GenerationSchedule
    from sqlalchemy import select

    async with async_session_factory() as db:
        result = await db.execute(
            select(GenerationSchedule).where(GenerationSchedule.id == schedule_id)
        )
        schedule = result.scalar_one_or_none()
        if not schedule:
            return
        schedule.last_run_at = utcnow()
        schedule.run_count = (schedule.run_count or 0) + 1
        schedule.last_status = "running"
        schedule.last_error = None
        await db.commit()


async def _update_schedule_stats(
    schedule_id: str, status: str, error: str | None
) -> None:
    """执行**结束**更新最终状态。触发计数已在 _mark_schedule_started 记过，这里不再 +1。"""
    from app.core.database import async_session_factory
    from app.models.generation_schedule import GenerationSchedule
    from sqlalchemy import select

    async with async_session_factory() as db:
        result = await db.execute(
            select(GenerationSchedule).where(GenerationSchedule.id == schedule_id)
        )
        schedule = result.scalar_one_or_none()
        if not schedule:
            return
        schedule.last_status = status
        schedule.last_error = error
        await db.commit()


class SchedulerService:
    """进程内 APScheduler 单例，由 main.py lifespan 管理生命周期。"""

    def __init__(self) -> None:
        self._scheduler = AsyncIOScheduler()

    def _make_trigger(self, schedule: "GenerationSchedule") -> CronTrigger:
        return CronTrigger(
            hour=schedule.cron_hour,
            minute=schedule.cron_minute,
            day_of_week=schedule.cron_days_of_week or "*",  # None = 每天
            timezone=schedule.timezone or "Asia/Shanghai",
        )

    def _job_id(self, schedule_id: str) -> str:
        return f"gen_schedule_{schedule_id}"

    async def startup(self) -> None:
        """应用启动时：从 DB 加载所有激活规则并注册 cron 任务。"""
        from app.core.database import async_session_factory
        from app.models.generation_schedule import GenerationSchedule
        from sqlalchemy import select

        self._scheduler.start()
        logger.info("[Scheduler] AsyncIOScheduler started")

        async with async_session_factory() as db:
            result = await db.execute(
                select(GenerationSchedule).where(GenerationSchedule.is_active == True)  # noqa: E712
            )
            schedules = result.scalars().all()

        for sched in schedules:
            self._register(sched)

        logger.info("[Scheduler] Loaded %d active schedule(s) from DB", len(schedules))

        # ---- 订阅相关静态 cron 任务 ----
        self._register_billing_jobs()

    def _register_billing_jobs(self) -> None:
        """订阅到期 + 订单超时的两个定时任务。配置见 settings。"""
        from apscheduler.triggers.interval import IntervalTrigger
        from app.core.config import settings

        self._scheduler.add_job(
            _run_expire_subscriptions,
            trigger=CronTrigger(
                hour=settings.SUBSCRIPTION_EXPIRY_CHECK_HOUR,
                minute=settings.SUBSCRIPTION_EXPIRY_CHECK_MINUTE,
                timezone="UTC",
            ),
            id="billing_expire_subscriptions",
            replace_existing=True,
            misfire_grace_time=600,
        )
        self._scheduler.add_job(
            _run_expire_pending_orders,
            trigger=IntervalTrigger(minutes=settings.ORDER_CLEANUP_INTERVAL_MINUTES),
            id="billing_expire_pending_orders",
            replace_existing=True,
            misfire_grace_time=120,
        )
        logger.info(
            "[Scheduler] Billing jobs registered: subscriptions@%02d:%02d UTC, orders every %dmin",
            settings.SUBSCRIPTION_EXPIRY_CHECK_HOUR,
            settings.SUBSCRIPTION_EXPIRY_CHECK_MINUTE,
            settings.ORDER_CLEANUP_INTERVAL_MINUTES,
        )

        # ---- 推量发数据采集每日 cron ----
        self._scheduler.add_job(
            _run_tlf_metrics_daily,
            trigger=CronTrigger(
                hour=settings.TLF_METRICS_DAILY_HOUR,
                minute=settings.TLF_METRICS_DAILY_MINUTE,
                timezone="Asia/Shanghai",
            ),
            id="tlf_metrics_daily",
            replace_existing=True,
            misfire_grace_time=600,
        )
        logger.info(
            "[Scheduler] TLF metrics job registered @ %02d:%02d Asia/Shanghai",
            settings.TLF_METRICS_DAILY_HOUR,
            settings.TLF_METRICS_DAILY_MINUTE,
        )

        # ---- 埋点数据每日聚合 cron ----
        self._scheduler.add_job(
            _run_analytics_daily,
            trigger=CronTrigger(
                hour=settings.ANALYTICS_DAILY_HOUR,
                minute=settings.ANALYTICS_DAILY_MINUTE,
                timezone="Asia/Shanghai",
            ),
            id="analytics_daily_stats",
            replace_existing=True,
            misfire_grace_time=1800,
        )
        logger.info(
            "[Scheduler] Analytics daily job registered @ %02d:%02d Asia/Shanghai",
            settings.ANALYTICS_DAILY_HOUR,
            settings.ANALYTICS_DAILY_MINUTE,
        )

    def shutdown(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)
            logger.info("[Scheduler] AsyncIOScheduler shut down")

    def _register(self, schedule: "GenerationSchedule") -> None:
        job_id = self._job_id(schedule.id)
        self._scheduler.add_job(
            _run_scheduled_job,
            trigger=self._make_trigger(schedule),
            id=job_id,
            args=[schedule.id],
            replace_existing=True,
            misfire_grace_time=300,  # 5 分钟内允许补跑
        )
        logger.info(
            "[Scheduler] Registered job | id=%s name=%s hour=%s minute=%s days=%s",
            job_id, schedule.name, schedule.cron_hour, schedule.cron_minute,
            schedule.cron_days_of_week or "every day",
        )

    def add_job(self, schedule: "GenerationSchedule") -> None:
        """创建规则后调用，立即注册 cron 任务。"""
        if schedule.is_active:
            self._register(schedule)

    def remove_job(self, schedule_id: str) -> None:
        """删除规则后调用，移除 cron 任务。"""
        job_id = self._job_id(schedule_id)
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)
            logger.info("[Scheduler] Removed job | id=%s", job_id)

    def update_job(self, schedule: "GenerationSchedule") -> None:
        """更新规则或切换启用状态后调用。"""
        job_id = self._job_id(schedule.id)
        if schedule.is_active:
            self._register(schedule)
        else:
            if self._scheduler.get_job(job_id):
                self._scheduler.remove_job(job_id)
                logger.info("[Scheduler] Paused job (disabled) | id=%s", job_id)

    def get_next_run_time(self, schedule_id: str) -> datetime | None:
        """返回下次执行时间（naive UTC）。

        APScheduler 的 next_run_time 是带时区的（cron 用 Asia/Shanghai 解释 17:00），
        必须转成 UTC 再去 tzinfo——全系统按 UTC 存/返回（ScheduleResponse 继承 UtcModel
        会给 naive 补 +00:00）。不能转成 _CST（北京）再去 tzinfo，否则北京 17:00 会被当作
        UTC 17:00 返回，前端 +8 后显示成次日 01:00。"""
        job = self._scheduler.get_job(self._job_id(schedule_id))
        if not job or not job.next_run_time:
            return None
        return job.next_run_time.astimezone(timezone.utc).replace(tzinfo=None)

    async def run_now(self, schedule_id: str) -> None:
        """立即触发一次（不影响定期调度；停用中的规则也执行——manual 绕过 is_active）。"""
        logger.info("[Scheduler] Manual run triggered | schedule_id=%s", schedule_id)
        await _run_scheduled_job(schedule_id, manual=True)


# 全局单例
scheduler_service = SchedulerService()
