"""推量发 国内分发平台业务路由"""
from __future__ import annotations

from datetime import datetime

from app.core.time import utcnow

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import AppException, ForbiddenError, NotFoundError
from app.models.generated_content import GeneratedContent
from app.models.tlf_account import TlfAccount
from app.models.tlf_account_metric import TlfAccountMetric
from app.models.tlf_distribution_task import TlfDistributionTask
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.schemas.tlf import (
    RiskConfirmRequest,
    TlfAccountResponse,
    TlfMetricResponse,
    TlfPrefillRequest,
    TlfPublishRequest,
    TlfSyncBatchRequest,
    TlfTaskResponse,
    StartAuthorizationRequest,
    StartAuthorizationResponse,
    TlfProxyRegionsResponse,
)
from app.services import tlf_client
from app.services.tlf_content_payload import build_publish_fields


router = APIRouter(prefix="/tlf", tags=["国内分发-推量发"])


# ============ 账号 ============

@router.get("/accounts")
async def list_accounts(
    platform_code: str | None = Query(None),
    status: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TlfAccount).where(TlfAccount.user_id == current_user.id)
    if platform_code:
        stmt = stmt.where(TlfAccount.platform_code == platform_code)
    if status:
        stmt = stmt.where(TlfAccount.status == status)
    stmt = stmt.order_by(desc(TlfAccount.created_at))
    rows = (await db.execute(stmt)).scalars().all()
    return success(data=[TlfAccountResponse.model_validate(a).model_dump(mode="json") for a in rows])


@router.get("/proxy-regions")
async def list_proxy_regions(
    current_user: User = Depends(get_current_user),
):
    """扫码绑定前取可选代理网络区域 + 当前用户上次选择的区域。

    `last_selected_region` 基于该用户已绑账号推断；用户清空所有账号后会变 null（前端据此弹窗让其重选）。
    """
    data = await tlf_client.get_proxy_regions(external_user_id=str(current_user.id))
    return success(
        data=TlfProxyRegionsResponse(
            regions=list(data.get("regions") or []),
            last_selected_region=data.get("last_selected_region"),
        ).model_dump()
    )


@router.post("/accounts/authorize")
async def start_authorization(
    body: StartAuthorizationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """发起云端授权，返回二维码与 operationId 给前端展示。

    代理由推量发网关统一分配，主 backend 无需传 proxy。
    """
    cb = {"user_id": current_user.id, "platform_code": body.platform_code}
    data = await tlf_client.start_cloud_authorization(
        body.platform_code,
        callback_data=cb,
        password=body.password,
        region=body.region,
    )
    # 推量发 SDK 返回 snake_case（operation_id / qr_code / session_id）；
    # 兼容保留 camelCase 兜底，避免网关字段风格变化时再次踩坑。
    return success(
        data=StartAuthorizationResponse(
            operation_id=data.get("operation_id") or data.get("operationId") or "",
            qr_code=data.get("qr_code") or data.get("qrCode"),
            scheme=data.get("scheme"),
            session_id=data.get("session_id") or data.get("sessionId"),
            redirect_url=data.get("redirect_url") or data.get("redirectUrl"),
        ).model_dump()
    )


def _apply_remote_to_account(account: TlfAccount, remote: dict) -> None:
    """把推量发同步返回（snake_case，camelCase 兜底）写回 TlfAccount。单账号/批量同步共用。"""
    raw_status = (remote.get("status") or "").lower()
    mapped = {"active": "active", "expired": "expired", "revoked": "revoked"}.get(raw_status)
    if mapped:
        account.status = mapped
    account.platform_user_name = (
        remote.get("platform_user_name") or remote.get("platformUserName") or account.platform_user_name
    )
    account.platform_avatar = (
        remote.get("platform_avatar") or remote.get("platformAvatar") or account.platform_avatar
    )
    account.platform_home_url = (
        remote.get("platform_home_url") or remote.get("platformHomeUrl") or account.platform_home_url
    )
    hip = remote.get("home_url_is_profile")
    if hip is None:
        hip = remote.get("homeUrlIsProfile")
    if hip is not None:
        account.home_url_is_profile = hip
    account.last_sync_at = utcnow()


@router.post("/accounts/{account_id}/sync")
async def sync_account(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """主动同步账号状态（推量发从灵径拉最新 → 返回 snake_case）。"""
    account = await _get_owned_account(db, account_id, current_user)
    remote = await tlf_client.get_remote_account(account.tlf_account_id)
    _apply_remote_to_account(account, remote)
    await db.flush()
    await db.commit()  # 返回前提交，否则前端随后刷新列表/状态读到旧数据
    await db.refresh(account)
    data = TlfAccountResponse.model_validate(account).model_dump(mode="json")
    # 透传网关本次登录检测结论（active/expired/error）；error=检测异常，前端可提示"暂时无法核验"
    data["login_check"] = remote.get("login_check")
    return success(data=data)


@router.post("/accounts/sync-batch")
async def sync_accounts_batch(
    body: TlfSyncBatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """批量同步/检查账号状态：传入本地账号 id 列表 → 网关逐账号并发检测登录态 → 回写并返回。

    单次条数上限由网关控制（超过网关返回 40000）；前端「批量检查所有状态」应分批调用。
    返回 data 为账号数组：成功项同单同步（含 login_check），失败项 {id, login_check:"error"} 不影响其它。
    """
    ids = list(dict.fromkeys(body.account_ids))  # 去重保序
    if not ids:
        return success(data=[])
    rows = (await db.execute(
        select(TlfAccount).where(TlfAccount.id.in_(ids), TlfAccount.user_id == current_user.id)
    )).scalars().all()
    by_gid = {a.tlf_account_id: a for a in rows if a.tlf_account_id}
    if not by_gid:
        return success(data=[])
    remote_list = await tlf_client.sync_accounts_batch(list(by_gid.keys()))
    out: list[dict] = []
    for r in remote_list:
        acc = by_gid.get(r.get("account_id"))
        if acc is None:
            continue
        is_err = r.get("status") == "error" or bool(r.get("error"))
        if not is_err:
            _apply_remote_to_account(acc, r)
        item = TlfAccountResponse.model_validate(acc).model_dump(mode="json")
        item["login_check"] = "error" if is_err else r.get("login_check")
        out.append(item)
    await db.commit()
    return success(data=out)


@router.get("/accounts/{account_id}/categories")
async def get_account_categories(
    account_id: str,
    publish_kind: str = Query(..., pattern=r"^(video|article|dynamic)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取账号某发布类型的内容分类树（部分平台发布必填，如哔哩哔哩视频）。"""
    account = await _get_owned_account(db, account_id, current_user)
    try:
        cats = await tlf_client.get_categories(account.tlf_account_id, publish_kind)
    except tlf_client.TlfBusinessError as exc:
        # 取分类时上游报登录态失效 → 把本地账号置 expired（账号管理会显示「登录过期」），
        # 并返回可操作文案引导用户重新扫码授权
        if tlf_client.is_login_expired(exc):
            if account.status == "active":
                account.status = "expired"
                account.last_sync_at = utcnow()
                await db.commit()
            raise AppException(
                code=40301,
                message=f"账号「{account.platform_user_name or account.platform_user_id}」登录态已失效，请到「账号管理」重新扫码授权后再发布",
            )
        raise
    return success(data=cats)


# ============ 抖音发布风控解除 ============

def _ensure_douyin(account: TlfAccount) -> None:
    if account.platform_code != "DouYin":
        raise ForbiddenError("发布风控解除目前仅支持抖音")


@router.get("/accounts/{account_id}/risk-status")
async def get_account_risk_status(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询账号发布风控状态（抖音）。返回 {risk_status, check_methods:[{type,name}]}。"""
    account = await _get_owned_account(db, account_id, current_user)
    _ensure_douyin(account)
    data = await tlf_client.get_risk_status(account.tlf_account_id)
    return success(data=data)


@router.post("/accounts/{account_id}/risk-sms")
async def send_account_risk_sms(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """发送风控验证短信到账号绑定手机。返回 {mobile}（掩码）。"""
    account = await _get_owned_account(db, account_id, current_user)
    _ensure_douyin(account)
    data = await tlf_client.send_risk_sms(account.tlf_account_id)
    return success(data=data)


@router.post("/accounts/{account_id}/risk-confirm")
async def confirm_account_risk(
    account_id: str,
    body: RiskConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """解除账号发布风控。method=password 用登录密码；method=smscode 用短信验证码。

    🔴 password 仅透传给上游，**不落库、不记录日志**（与扫码授权密码同等处理）。
    """
    account = await _get_owned_account(db, account_id, current_user)
    _ensure_douyin(account)
    if body.method == "password" and not body.password:
        raise AppException(code=40000, message="登录密码不能为空")
    if body.method == "smscode" and not body.code:
        raise AppException(code=40000, message="短信验证码不能为空")
    data = await tlf_client.confirm_risk(
        account.tlf_account_id, method=body.method, password=body.password, code=body.code,
    )
    return success(data=data, message="风控解除请求已提交")


@router.get("/accounts/auth-status/{operation_id}")
async def get_auth_status(
    operation_id: str,
    current_user: User = Depends(get_current_user),
):
    """查询某个授权 operationId 的最新状态（pending / scanned / success / failed）。

    数据来源：webhook handler 写入 Redis（key=tlf:auth-op:{operation_id}，TTL 600s）。
    没找到默认返回 pending —— 即「还在等推量发推 webhook」。
    """
    from app.core.config import settings as _s
    from app.core.redis import get_redis as _get_redis
    import json as _json

    redis = _get_redis()
    raw = await redis.get(f"{_s.TLF_REDIS_PREFIX}auth-op:{operation_id}")
    if not raw:
        return success(data={"status": "pending"})
    try:
        return success(data=_json.loads(raw))
    except Exception:
        return success(data={"status": "pending"})


@router.post("/accounts/probe")
async def probe_accounts(
    platform_code: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """主动同步：拉远端已授权账号列表 → 把当前用户**自己刚扫码**的新账号入库。

    使用场景：本地开发或公网 webhook 不可达时，用户扫码完成后点击「我已扫码」，
    前端调用本接口立即拉取云端账号列表，将本地尚未存在的账号入库。

    ⚠ 多租户隔离要点：云端 `GET /media-accounts` 返回的是**全应用**所有账号
    （同事 A、B 在本应用下绑的账号都会出现），所以 probe 在判断「这条账号是不是
    我刚扫的」时必须用**全局** tlf_account_id 黑名单（任一用户已绑则跳过），
    而不是只查当前 user_id 名下的账号——否则会把同事已绑的账号当成自己刚扫的导入。

    Returns:
        新建的本地账号列表（已存在的、属于他人的均不会被导入）
    """
    remote_list = await tlf_client.list_remote_accounts(platform_code=platform_code)

    # 全局已知的 tlf_account_id（任一用户已绑过 = 不能再算作当前用户「刚扫的」）
    global_stmt = select(TlfAccount.tlf_account_id)
    if platform_code:
        global_stmt = global_stmt.where(TlfAccount.platform_code == platform_code)
    known_remote_ids: set[str] = {
        row for row in (await db.execute(global_stmt)).scalars().all() if row
    }

    # 国内账号配额闸门：与 webhook 授权路径保持一致，按 套餐 domestic_accounts_quota + 永久账号加包 实时计数拦截。
    # probe 是「我已扫码」主动入库的主路径，必须在此卡配额，否则可绕过 webhook 校验无限绑定。
    from app.services.saas_subscription import get_active_subscription
    from app.services.usage_aggregator import get_user_account_count
    _sub = await get_active_subscription(db, current_user.id)
    _domestic_quota = (
        int(_sub.domestic_accounts_quota or 0) + int(_sub.addon_domestic_accounts or 0) if _sub else 0
    )
    _remaining_slots = max(
        0, _domestic_quota - await get_user_account_count(db, current_user.id, "domestic")
    )

    now = utcnow()
    new_accounts: list[TlfAccount] = []
    skipped_other_user = 0
    skipped_quota = 0
    for item in remote_list:
        # 推量发 /accounts 返回 snake_case：lapi_account_id（网关账号 ID）/ platform_code / platform_user_id …
        # 注意：item["id"] 是推量发内部行 UUID，不能当网关账号 ID 用。保留 camelCase 兜底。
        tlf_id = item.get("lapi_account_id") or item.get("tlf_account_id") or item.get("accountId")
        plat = item.get("platform_code") or item.get("platformCode") or platform_code
        plat_user_id = item.get("platform_user_id") or item.get("platformUserId") or item.get("openId")
        plat_user_name = item.get("platform_user_name") or item.get("platformUserName")
        plat_avatar = item.get("platform_avatar") or item.get("platformAvatar")
        plat_home_url = item.get("platform_home_url") or item.get("platformHomeUrl")
        plat_home_is_profile = item.get("home_url_is_profile")
        if plat_home_is_profile is None:
            plat_home_is_profile = item.get("homeUrlIsProfile")
        if not (tlf_id and plat and plat_user_id):
            continue
        if tlf_id in known_remote_ids:
            # 该账号已存在于某个用户名下（自己 or 别人）——不导入，避免跨用户串账号
            skipped_other_user += 1
            continue
        # 二次去重：同 user + platform + platform_user_id 已存在（同号重新授权）→ 更新而非新建
        dup = (await db.execute(
            select(TlfAccount).where(
                TlfAccount.user_id == current_user.id,
                TlfAccount.platform_code == plat,
                TlfAccount.platform_user_id == plat_user_id,
            )
        )).scalar_one_or_none()
        if dup is not None:
            dup.tlf_account_id = tlf_id
            dup.platform_user_name = plat_user_name or dup.platform_user_name
            dup.platform_avatar = plat_avatar or dup.platform_avatar
            dup.platform_home_url = plat_home_url or dup.platform_home_url
            if plat_home_is_profile is not None:
                dup.home_url_is_profile = plat_home_is_profile
            dup.status = "active"
            dup.last_authed_at = now
            dup.last_sync_at = now
            continue

        # 新账号受国内配额限制：额度用尽则跳过（远端已绑定但本地不导入，与 webhook 拒绝行为一致）
        if _remaining_slots <= 0:
            skipped_quota += 1
            continue

        account = TlfAccount(
            user_id=current_user.id,
            tlf_account_id=tlf_id,
            platform_code=plat,
            platform_user_id=plat_user_id,
            platform_user_name=plat_user_name,
            platform_avatar=plat_avatar,
            platform_home_url=plat_home_url,
            home_url_is_profile=plat_home_is_profile,
            status="active",
            last_authed_at=now,
            last_sync_at=now,
        )
        db.add(account)
        new_accounts.append(account)
        _remaining_slots -= 1

    await db.flush()
    await db.commit()  # 返回前提交，否则前端随后刷新账号列表读到旧数据
    for a in new_accounts:
        await db.refresh(a)

    if skipped_other_user > 0:
        import logging
        logging.getLogger(__name__).info(
            "[TLF-PROBE] user=%s 跳过 %d 个已被其他用户绑定的远端账号",
            current_user.id, skipped_other_user,
        )
    if skipped_quota > 0:
        import logging
        logging.getLogger(__name__).warning(
            "[TLF-PROBE] user=%s 国内账号数已达上限（%d），跳过 %d 个新账号未导入",
            current_user.id, _domestic_quota, skipped_quota,
        )

    msg_parts: list[str] = []
    if new_accounts:
        msg_parts.append(f"已同步 {len(new_accounts)} 个新账号")
    if skipped_quota > 0:
        msg_parts.append(
            f"{skipped_quota} 个账号因国内账号数已达上限（{_domestic_quota}）未导入，请升级套餐"
        )
    message = "；".join(msg_parts) if msg_parts else "未发现新账号"

    return success(
        data=[TlfAccountResponse.model_validate(a).model_dump(mode="json") for a in new_accounts],
        message=message,
    )


@router.delete("/accounts/{account_id}")
async def revoke_account(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """撤销并删除账号：先调推量发 DELETE，再从本地 DB 硬删除。

    历史发布任务的 account_snapshot 已经记录了账号快照，删除本行不影响审计追溯。
    """
    account = await _get_owned_account(db, account_id, current_user)
    try:
        await tlf_client.revoke_remote_account(account.tlf_account_id)
    except Exception as exc:
        # 推量发侧失败 / 已删除（404）也接受，避免本地清不掉脏数据
        import logging
        logging.getLogger(__name__).warning(
            "[TLF] 远端撤销失败但本地继续删除（可能已删除）：%s", exc
        )
    await db.delete(account)
    # 显式 commit 后再返回，否则前端收到响应后立刻发起的列表 GET 会走另一条连接读到未提交的旧数据
    await db.commit()
    return success(message="账号已删除")


# ============ 发布 ============

@router.post("/prefill")
async def prefill_publish_form(
    body: TlfPrefillRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """按内容 + 目标平台预填手动发布表单。

    与「定时自动分发」共用同一份字段映射(services/tlf_content_payload.build_publish_fields)——
    正文取哪个字段、多图、封面、截断上限只在后端一处维护，前端不再重复这套逻辑。
    返回**可编辑原文**（article=markdown 正文；前端提交时按平台 md→html），用户仍可改。
    """
    record = (await db.execute(
        select(GeneratedContent).where(
            GeneratedContent.id == body.content_id,
            GeneratedContent.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if record is None:
        raise NotFoundError("内容不存在或无权访问")

    f = build_publish_fields(record, body.platform_codes, body.kind)
    return success(data={
        "title": f.title,
        "body": f.body,
        "images": f.images,
        "covers": f.covers,
        "videoUrl": f.video_url,
        "tags": f.tags,
        "warnings": f.warnings,
    })


@router.post("/publish")
async def submit_publish(
    body: TlfPublishRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """提交一键发布任务。"""
    # 校验账号都属于当前用户 + 平台一致
    stmt = select(TlfAccount).where(
        TlfAccount.id.in_(body.account_ids),
        TlfAccount.user_id == current_user.id,
    )
    rows = (await db.execute(stmt)).scalars().all()
    if len(rows) != len(body.account_ids):
        raise NotFoundError("部分账号不存在或不属于当前用户")
    for a in rows:
        if a.platform_code != body.platform_code:
            raise ForbiddenError(f"账号 {a.id} 平台({a.platform_code})与目标({body.platform_code})不一致")
        if a.status != "active":
            raise ForbiddenError(f"账号 {a.platform_user_name or a.id} 状态为 {a.status}，无法发布")

    # 预生成子任务 ID（每账号一个，写入 account_snapshot 便于 webhook 回查）
    import uuid as _uuid
    sub_task_ids = [str(_uuid.uuid4()) for _ in rows]

    # 内容快照：发布时存一份 title/body 摘要到 task，供任务监控列表显示用
    # （前端按 content_snapshot.title 渲染任务名；缺失时回退到 body.title）
    content_snapshot: dict = {
        "title": body.title,
        "publish_kind": body.publish_kind,
        "summary": (body.body or "")[:200] if body.body else None,
    }
    if body.video_url:
        content_snapshot["video_url"] = body.video_url
    if body.cover_urls:
        content_snapshot["cover_url"] = body.cover_urls[0]

    # 构造本地任务
    task = TlfDistributionTask(
        user_id=current_user.id,
        content_id=body.content_id,
        platform_code=body.platform_code,
        target_account_ids=[a.id for a in rows],
        account_snapshot=[
            {
                "id": a.id,
                "tlfAccountId": a.tlf_account_id,
                "subTaskId": sub_tid,  # 与推量发 tasks[i].taskId 对应，webhook 按此匹配单账号
                "platformUserId": a.platform_user_id,
                "platformUserName": a.platform_user_name,
                "platformAvatar": a.platform_avatar,
                "platformHomeUrl": a.platform_home_url,  # 任务监控逐账号「查看主页/平台」优先用此存储 URL
                "platformHomeUrlIsProfile": a.home_url_is_profile,  # true=用户主页 / false=平台首页
            }
            for a, sub_tid in zip(rows, sub_task_ids, strict=True)
        ],
        content_snapshot=content_snapshot,
        status="pending",
        total_count=len(rows),
        pre_pub_time=body.pre_pub_time,
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)

    # 调推量发提交（注意：推量发 publish 接口不返回 operationId，全靠 webhook 回调匹配）
    content_payload: dict = {
        "title": body.title,
        "body": body.body,
        "mediaUrls": body.media_urls or [],
    }
    if body.video_url:
        content_payload["videoUrl"] = body.video_url
    if body.cover_urls:
        content_payload["covers"] = body.cover_urls
    if body.html_content:
        content_payload["content"] = body.html_content
    cb = {"task_id": task.id, "user_id": current_user.id}
    # 扩展字段（按目标平台 spec 在 service 层过滤透传）
    extras = {
        "visible_type": body.visible_type,
        "statement": body.statement,
        "pre_pub_time": body.pre_pub_time,
        "topics": body.topics,
        "tags": body.tags,
        "location": body.location,
        "create_type": body.create_type,
        "category": body.category,
        "sub_category": body.sub_category,
        # 海外平台特有参数（如 Reddit subreddit）整体透传到网关 PublishRequest.extra
        "extra": body.extra,
    }
    try:
        await tlf_client.submit_publish(
            tlf_account_ids=[a.tlf_account_id for a in rows],
            content=content_payload,
            callback_data=cb,
            sub_task_ids=sub_task_ids,
            publish_type=body.publish_kind,
            platform_code=body.platform_code,
            extras=extras,
        )
        task.status = "publishing"
    except Exception as exc:
        task.status = "failed"
        task.error_message = str(exc)[:1000]
        # 提交时上游报登录态失效 → 把本次涉及账号置 expired（账号管理显示「登录过期」），
        # 并把错误文案换成可操作引导
        if tlf_client.is_login_expired(exc):
            for a in rows:
                if a.status == "active":
                    a.status = "expired"
                    a.last_sync_at = utcnow()
            await db.commit()
            raise AppException(
                code=40301,
                message="部分账号登录态已失效，请到「账号管理」重新扫码授权后再发布",
            )
        await db.flush()
        raise

    # 分发扣分：按本次发布的账号数（rows 长度）× distribution 单价
    from app.services.billing_config_service import credits_for_distribution
    from app.services.saas_quota import (
        QuotaExceededError as _QuotaExceededError,
        consume_points as _consume_points,
    )
    import logging as _logging
    _lg = _logging.getLogger(__name__)
    try:
        credits, meta = await credits_for_distribution(db, account_count=len(rows))
        await _consume_points(
            db, current_user.id, credits,
            biz_type="distribution",
            biz_ref_type="tlf_distribution_task",
            biz_ref_id=str(task.id),
            unit_price=meta["unit_price"],
            units=meta["units"],
            remark=f"国内分发 · {body.platform_code} · {len(rows)} 个账号",
        )
    except _QuotaExceededError as e:
        _lg.warning("tlf distribution consume_points failed user=%s: %s",
                    current_user.id, e.message)
    except Exception:  # noqa: BLE001
        _lg.warning("tlf distribution consume_points unexpected", exc_info=True)

    await db.flush()
    await db.commit()  # 返回前提交，否则前端随后刷新任务列表读到旧数据
    await db.refresh(task)
    return success(data=TlfTaskResponse.model_validate(task).model_dump(mode="json"))


@router.get("/tasks")
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    platform_code: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base = select(TlfDistributionTask).where(TlfDistributionTask.user_id == current_user.id)
    if status:
        base = base.where(TlfDistributionTask.status == status)
    if platform_code:
        base = base.where(TlfDistributionTask.platform_code == platform_code)

    from sqlalchemy import func
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = base.order_by(desc(TlfDistributionTask.created_at)).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()
    # 读取时兜底：把长时间无终态回调的「分发中」任务判超时失败，前端据此停止轮询
    if any(_finalize_if_timed_out(t) for t in rows):
        await db.commit()
        for t in rows:
            await db.refresh(t)
    items = [TlfTaskResponse.model_validate(t).model_dump(mode="json") for t in rows]
    return success(data=PaginatedData[dict].create(items=items, total=total, page=page, page_size=page_size).model_dump())


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(TlfDistributionTask, task_id)
    if task is None or task.user_id != current_user.id:
        raise NotFoundError("任务不存在")
    if _finalize_if_timed_out(task):
        await db.commit()
        await db.refresh(task)
    return success(data=TlfTaskResponse.model_validate(task).model_dump(mode="json"))


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(TlfDistributionTask, task_id)
    if task is None or task.user_id != current_user.id:
        raise NotFoundError("任务不存在")
    if task.status not in ("pending", "publishing"):
        raise ForbiddenError(f"任务状态 {task.status} 不可取消")
    # 推量发文档未提供发布任务取消端点；只能本地标记 cancelled。
    # 已经提交到推量发并在云端推送中的任务无法真正中断，仅停止本地后续状态翻转。
    task.status = "cancelled"
    await db.commit()  # 返回前提交，否则前端随后刷新任务状态读到旧数据
    return success(message="任务已在本地标记取消（推量发侧仍可能继续执行）")


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除一条分发任务（本地硬删除）。

    删除后，推量发后续迟到的 webhook（publishResult/Process/auditStatus）按 callBackData.task_id
    找不到本地任务 → 各 handler 直接丢弃（已内置兜底），不会报错或残留。
    推量发侧的发布无法撤回，删除仅清理本地记录。
    """
    task = await db.get(TlfDistributionTask, task_id)
    if task is None or task.user_id != current_user.id:
        raise NotFoundError("任务不存在")
    await db.delete(task)
    await db.commit()  # 显式提交，否则前端随后刷新列表走另一条连接读到未删的旧数据
    return success(message="任务已删除")


# ============ 数据采集 ============

@router.get("/metrics/accounts/{account_id}")
async def list_account_metrics(
    account_id: str,
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_account(db, account_id, current_user)
    stmt = (
        select(TlfAccountMetric)
        .where(
            TlfAccountMetric.tlf_account_id == account_id,
            TlfAccountMetric.user_id == current_user.id,
        )
        .order_by(desc(TlfAccountMetric.snapshot_date))
        .limit(days)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return success(data=[TlfMetricResponse.model_validate(m).model_dump(mode="json") for m in rows])


@router.post("/metrics/accounts/{account_id}/refresh")
async def refresh_account_metrics(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """触发账号概览数据采集（异步：推量发接口同步只回 ok，真实数据由 webhook 推回）。

    前端调用后建议 5~10s 后再 GET /metrics/accounts/{id} 查看最新快照。
    """
    account = await _get_owned_account(db, account_id, current_user)
    cb = {"user_id": current_user.id, "account_id": account.id}
    await tlf_client.trigger_account_overview(
        account.tlf_account_id, callback_data=cb
    )
    return success(message="数据采集已触发，请稍后刷新查看", data={"triggered": True})


# ============ 辅助函数 ============

def _finalize_if_timed_out(task: TlfDistributionTask) -> bool:
    """无回调兜底：pending/publishing 任务超过 TLF_TASK_TIMEOUT_MINUTES 仍无终态则判超时。

    场景：推量发/上游未推送任一终态 webhook（publishResult），任务会永远停在「分发中」，
    前端据 status 无限轮询浪费算力。此处在读取任务时惰性收尾：
      - 用 updated_at 作为「最后活动时间」（进度 webhook 也会刷新它，正在上传的大文件不会被误杀）；
      - 把 account_snapshot 中尚未拿到 success/failed 终态的子任务标记为 failed（错误信息=超时）；
      - 已成功的保留，据成败比落 partial / failed；
    返回是否发生了修改（修改了才需要 commit）。
    """
    from datetime import timedelta
    from sqlalchemy.orm.attributes import flag_modified
    from app.core.config import settings
    from app.services.oversea_platforms import is_oversea_platform

    if task.status not in ("pending", "publishing"):
        return False
    last_active = task.updated_at or task.created_at
    if last_active is None:
        return False
    # 海外平台同步发布、结果靠转发回流，用更短窗口兜底；国内异步上传/转码用长窗口（updated_at 会被进度刷新）
    timeout_min = (settings.TLF_OVERSEA_TASK_TIMEOUT_MINUTES
                   if is_oversea_platform(task.platform_code)
                   else settings.TLF_TASK_TIMEOUT_MINUTES)
    if utcnow() - last_active < timedelta(minutes=timeout_min):
        return False

    snapshot = list(task.account_snapshot or [])
    summary = list(task.result_summary or [])
    by_sub = {r.get("subTaskId"): r for r in summary if isinstance(r, dict)}
    timeout_msg = f"发布超时：{timeout_min} 分钟内未收到平台完成回调，请重试"

    # snapshot 为空时退化为：直接按 total_count 推断（极端兜底）
    iter_subs = (
        [(e.get("subTaskId"), e) for e in snapshot if isinstance(e, dict)]
        if snapshot else [(r.get("subTaskId"), None) for r in summary]
    )
    for sub_id, snap in iter_subs:
        entry = by_sub.get(sub_id)
        if entry is not None and entry.get("status") in ("success", "failed"):
            continue  # 已有终态，保留
        if entry is None:
            entry = {
                "subTaskId": sub_id,
                "accountId": snap.get("id") if isinstance(snap, dict) else None,
                "tlfAccountId": snap.get("tlfAccountId") if isinstance(snap, dict) else None,
            }
            summary.append(entry)
            by_sub[sub_id] = entry
        entry["status"] = "failed"
        entry["errorMessage"] = timeout_msg

    s_count = sum(1 for r in summary if isinstance(r, dict) and r.get("status") == "success")
    f_count = sum(1 for r in summary if isinstance(r, dict) and r.get("status") == "failed")
    task.result_summary = summary
    task.success_count = s_count
    task.failed_count = f_count
    task.status = "partial" if s_count > 0 and f_count > 0 else ("success" if f_count == 0 and s_count > 0 else "failed")
    if task.status != "success":
        task.error_message = timeout_msg
    flag_modified(task, "result_summary")
    import logging
    logging.getLogger(__name__).warning(
        "[TLF-TIMEOUT] task=%s 无回调超时收尾 → %s (%d ok / %d fail)",
        task.id, task.status, s_count, f_count,
    )
    return True


async def _get_owned_account(db: AsyncSession, account_id: str, current_user: User) -> TlfAccount:
    account = await db.get(TlfAccount, account_id)
    if account is None or account.user_id != current_user.id:
        raise NotFoundError("账号不存在")
    return account
