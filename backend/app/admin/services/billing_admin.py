"""粒度化的收费配置/AI 模型管理。

底层仍写入 `platform_settings.billing_configuration` JSON，
本模块提供更友好的 CRUD/PATCH 语义，并在删除/禁用模型时
自动清理 `robot.modelId` 引用。
"""

from __future__ import annotations

import copy
import re
import time
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.admin.defaults.billing_defaults import BILLING_CONFIGURATION_DEFAULT
from app.admin.schemas.billing_admin import (
    AiModelCreate,
    AiModelPatch,
    AiModelSchema,
    AiModelUpdate,
    DistributionBody,
    ProfitRatioBody,
    RobotConfig,
)
from app.admin.services import console_meta, platform_settings_svc

_BILLING_KEY = "billing_configuration"

_SLUG_RX = re.compile(r"[^a-z0-9]+")


def _slugify(text: str) -> str:
    s = _SLUG_RX.sub("-", (text or "").strip().lower()).strip("-")
    return s or "model"


async def _load_cfg(db: AsyncSession) -> dict[str, Any]:
    cfg = await console_meta.get_billing_config(db)
    if not isinstance(cfg, dict):
        cfg = copy.deepcopy(BILLING_CONFIGURATION_DEFAULT)
    cfg.setdefault("models", list(BILLING_CONFIGURATION_DEFAULT["models"]))
    cfg.setdefault("distribution", BILLING_CONFIGURATION_DEFAULT["distribution"])
    cfg.setdefault("robot", copy.deepcopy(BILLING_CONFIGURATION_DEFAULT["robot"]))
    # 已废弃的计费项（充值兑换比例 / 存储库扣费 / 账号绑定单价 / 创作模型）：
    # 从历史 JSON 中剔除，任意一次 billing 保存都会顺带把它们清理掉。
    for _deprecated in ("creditRate", "storage", "accounts", "creationModels"):
        cfg.pop(_deprecated, None)
    return cfg


async def _save_cfg(db: AsyncSession, cfg: dict[str, Any], operator_id: str) -> dict[str, Any]:
    await platform_settings_svc.update_settings_partial(db, {_BILLING_KEY: cfg}, operator_id)
    return await console_meta.get_billing_config(db)


def _ensure_unique_id(models: list[dict[str, Any]], preferred: str | None, name_hint: str) -> str:
    base = (preferred or "").strip() or _slugify(name_hint)
    existing = {str(m.get("id")) for m in models}
    if base and base not in existing:
        return base
    suffix = int(time.time() * 1000)
    candidate = f"{base or 'model'}-{suffix}"
    while candidate in existing:
        suffix += 1
        candidate = f"{base or 'model'}-{suffix}"
    return candidate


def _models_typed(models: list[dict[str, Any]]) -> list[AiModelSchema]:
    out: list[AiModelSchema] = []
    for raw in models:
        try:
            out.append(AiModelSchema.model_validate(raw))
        except Exception:
            continue
    return out


def _filter_models(
    models: list[dict[str, Any]],
    *,
    q: str | None,
    model_type: str | None,
    enabled: bool | None,
) -> list[dict[str, Any]]:
    out = models
    if q:
        ql = q.strip().lower()
        if ql:
            out = [
                m
                for m in out
                if ql in str(m.get("name", "")).lower()
                or ql in str(m.get("provider", "")).lower()
                or ql in str(m.get("id", "")).lower()
            ]
    if model_type:
        out = [m for m in out if m.get("type") == model_type]
    if enabled is not None:
        out = [m for m in out if bool(m.get("enabled")) == bool(enabled)]
    return out


async def list_models(
    db: AsyncSession,
    *,
    q: str | None = None,
    model_type: str | None = None,
    enabled: bool | None = None,
) -> tuple[list[AiModelSchema], int]:
    cfg = await _load_cfg(db)
    raw_models = list(cfg.get("models") or [])
    filtered = _filter_models(raw_models, q=q, model_type=model_type, enabled=enabled)
    return _models_typed(filtered), len(filtered)


async def get_model(db: AsyncSession, model_id: str) -> AiModelSchema:
    cfg = await _load_cfg(db)
    for raw in cfg.get("models") or []:
        if str(raw.get("id")) == model_id:
            return AiModelSchema.model_validate(raw)
    raise NotFoundError("模型不存在")


async def create_model(db: AsyncSession, body: AiModelCreate, operator_id: str) -> AiModelSchema:
    if not body.name.strip() or not body.provider.strip():
        raise BadRequestError("请填写模型名称和提供商")

    cfg = await _load_cfg(db)
    models: list[dict[str, Any]] = list(cfg.get("models") or [])

    if body.id and any(str(m.get("id")) == body.id for m in models):
        raise ConflictError("同名模型 id 已存在")

    new_id = _ensure_unique_id(models, body.id, body.name)
    new_model = AiModelSchema(
        id=new_id,
        name=body.name.strip(),
        provider=body.provider.strip(),
        type=body.type,
        billingMode=body.billingMode,
        unitPrice=float(body.unitPrice),
        pricingMatrix=body.pricingMatrix,
        enabled=bool(body.enabled),
    )
    models.append(new_model.model_dump(mode="json"))
    cfg["models"] = models
    await _save_cfg(db, cfg, operator_id)
    return new_model


async def update_model(
    db: AsyncSession, model_id: str, body: AiModelUpdate, operator_id: str
) -> AiModelSchema:
    if not body.name.strip() or not body.provider.strip():
        raise BadRequestError("请填写模型名称和提供商")

    cfg = await _load_cfg(db)
    models: list[dict[str, Any]] = list(cfg.get("models") or [])
    idx = next((i for i, m in enumerate(models) if str(m.get("id")) == model_id), -1)
    if idx < 0:
        raise NotFoundError("模型不存在")

    new_model = AiModelSchema(
        id=model_id,
        name=body.name.strip(),
        provider=body.provider.strip(),
        type=body.type,
        billingMode=body.billingMode,
        unitPrice=float(body.unitPrice),
        pricingMatrix=body.pricingMatrix,
        enabled=bool(body.enabled),
    )
    models[idx] = new_model.model_dump(mode="json")
    cfg["models"] = models

    if not new_model.enabled:
        _prune_references(cfg, [model_id])

    await _save_cfg(db, cfg, operator_id)
    return new_model


async def patch_model(
    db: AsyncSession, model_id: str, body: AiModelPatch, operator_id: str
) -> AiModelSchema:
    cfg = await _load_cfg(db)
    models: list[dict[str, Any]] = list(cfg.get("models") or [])
    idx = next((i for i, m in enumerate(models) if str(m.get("id")) == model_id), -1)
    if idx < 0:
        raise NotFoundError("模型不存在")

    merged = dict(models[idx])
    patch_data = body.model_dump(exclude_unset=True)
    if "name" in patch_data and not str(patch_data["name"]).strip():
        raise BadRequestError("模型名称不能为空")
    if "provider" in patch_data and not str(patch_data["provider"]).strip():
        raise BadRequestError("提供商不能为空")
    merged.update(patch_data)

    new_model = AiModelSchema.model_validate(merged)
    models[idx] = new_model.model_dump(mode="json")
    cfg["models"] = models

    if not new_model.enabled:
        _prune_references(cfg, [model_id])

    await _save_cfg(db, cfg, operator_id)
    return new_model


async def delete_model(db: AsyncSession, model_id: str, operator_id: str) -> dict[str, Any]:
    cfg = await _load_cfg(db)
    models: list[dict[str, Any]] = list(cfg.get("models") or [])
    new_models = [m for m in models if str(m.get("id")) != model_id]
    if len(new_models) == len(models):
        raise NotFoundError("模型不存在")
    cfg["models"] = new_models

    _prune_references(cfg, [model_id])

    await _save_cfg(db, cfg, operator_id)
    return {"id": model_id, "removed": True}


def _prune_references(cfg: dict[str, Any], removed_or_disabled_ids: list[str]) -> None:
    """删除或禁用模型时，清理被引用的位置（机器人模型），避免前端选中"幽灵"模型。"""
    bad = {str(x) for x in removed_or_disabled_ids if x}
    if not bad:
        return

    enabled_ids = {str(m.get("id")) for m in cfg.get("models") or [] if m.get("enabled")}

    robot = cfg.get("robot")
    if isinstance(robot, dict) and robot.get("modelId") in bad:
        robot["modelId"] = next(iter(enabled_ids), "")


async def put_distribution(
    db: AsyncSession, body: DistributionBody, operator_id: str
) -> dict[str, Any]:
    cfg = await _load_cfg(db)
    cfg["distribution"] = float(body.distribution)
    saved = await _save_cfg(db, cfg, operator_id)
    return {"distribution": saved.get("distribution", 0)}


async def put_robot(db: AsyncSession, body: RobotConfig, operator_id: str) -> dict[str, Any]:
    cfg = await _load_cfg(db)
    enabled_ids = {str(m.get("id")) for m in cfg.get("models") or [] if m.get("enabled")}
    if body.modelId and body.modelId not in enabled_ids:
        raise BadRequestError("机器人模型必须是已启用的模型")
    cfg["robot"] = body.model_dump(mode="json")
    saved = await _save_cfg(db, cfg, operator_id)
    return saved.get("robot") or {}


async def put_profit_ratio(
    db: AsyncSession, body: ProfitRatioBody, operator_id: str
) -> dict[str, Any]:
    cfg = await _load_cfg(db)
    cfg["profitRatio"] = float(body.profitRatio)
    saved = await _save_cfg(db, cfg, operator_id)
    return {"profitRatio": saved.get("profitRatio", 0)}
