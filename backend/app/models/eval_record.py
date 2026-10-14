from __future__ import annotations

from sqlalchemy import Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BaseMixin


class EvalRecord(Base, BaseMixin):
    __tablename__ = "eval_records"

    eval_type: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="评估类型（retrieval=检索评估，generation=生成评估，e2e=端到端评估）"
    )
    metrics: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="聚合指标 JSON（如 MRR、NDCG、BLEU 等）"
    )
    config_snapshot: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="评估时的配置快照（embedding 模型、检索参数等）"
    )
    question_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="参与评估的问题总数"
    )
    details: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True, comment="每条 QA 的详细得分（JSON 数组）"
    )
