from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDBin16, _generate_uuid7


class ReferralReward(Base):
    """普通用户「邀请有礼」邀请关系 + 奖励发放状态。

    邀请关系与奖励发放的唯一真相源（不动 users 表）：
    - 一阶（注册）奖励：被邀请人注册时发给邀请人；
    - 二阶（充值）奖励：被邀请人首次真实充值成功时发给邀请人（recharge_granted_at 保证幂等）。
    """

    __tablename__ = "referral_rewards"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键"
    )
    inviter_id: Mapped[str] = mapped_column(
        UUIDBin16,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="邀请人 users.id",
    )
    invitee_id: Mapped[str] = mapped_column(
        UUIDBin16,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        comment="被邀请人 users.id（一个被邀请人只归属一个邀请人）",
    )
    invitation_code: Mapped[str | None] = mapped_column(
        String(32), nullable=True, comment="注册时使用的邀请码快照"
    )

    # 一阶（注册）奖励
    register_granted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="一阶奖励发放时间（UTC）"
    )
    register_points: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="一阶奖励发放积分快照"
    )

    # 二阶（充值）奖励
    recharge_granted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="二阶奖励发放时间（UTC）"
    )
    recharge_points: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="二阶奖励发放积分快照"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间"
    )
