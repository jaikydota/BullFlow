from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BillingMode = Literal["pay_as_you_go", "fixed"]
ModelType = Literal["text", "image", "video", "audio", "multimodal"]
PricingMatrixBy = Literal["size", "resolution_duration"]


class PricingMatrixItem(BaseModel):
    """规格 → 倍率：key 是机器值（如 '1024x1024'），label 是人类标签，multiplier 是单价倍率。"""

    key: str
    label: str
    multiplier: float = 1.0


class PricingMatrix(BaseModel):
    """图片/视频按规格定价矩阵。最终费用 = unitPrice × multiplier (× duration 仅视频)。"""

    by: PricingMatrixBy
    items: list[PricingMatrixItem] = Field(default_factory=list)


class AiModelSchema(BaseModel):
    """完整模型记录（GET / 列表 / 写回 platform_settings.billing_configuration.models 时使用）。"""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    provider: str
    type: ModelType
    billingMode: BillingMode
    unitPrice: float = 0
    pricingMatrix: PricingMatrix | None = None
    enabled: bool = True


class AiModelCreate(BaseModel):
    """新增模型；缺省 `id` 时由服务端生成。"""

    id: str | None = None
    name: str
    provider: str
    type: ModelType
    billingMode: BillingMode = "pay_as_you_go"
    unitPrice: float = 0
    pricingMatrix: PricingMatrix | None = None
    enabled: bool = True


class AiModelUpdate(BaseModel):
    """PUT：完整覆盖（除 id 外的字段全部必填）。"""

    name: str
    provider: str
    type: ModelType
    billingMode: BillingMode
    unitPrice: float = 0
    pricingMatrix: PricingMatrix | None = None
    enabled: bool = True


class AiModelPatch(BaseModel):
    """PATCH：仅修改提供的字段；常用于启用/禁用单价微调。"""

    name: str | None = None
    provider: str | None = None
    type: ModelType | None = None
    billingMode: BillingMode | None = None
    unitPrice: float | None = None
    pricingMatrix: PricingMatrix | None = None
    enabled: bool | None = None


class RobotConfig(BaseModel):
    modelId: str = ""
    unitPrice: float = 0


class DistributionBody(BaseModel):
    distribution: float


class ProfitRatioBody(BaseModel):
    profitRatio: float
