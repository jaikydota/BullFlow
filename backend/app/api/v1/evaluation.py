from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.time import to_utc_iso
from app.models.eval_record import EvalRecord
from app.models.user import User
from app.schemas.common import success

router = APIRouter(prefix="/evaluation", tags=["RAG 评估"])


class EvalRunRequest(BaseModel):
    questions: list[str] = Field(..., min_length=1, description="评估问题列表")
    ground_truths: list[str] = Field(..., min_length=1, description="标准答案列表")
    eval_type: str = Field("e2e", description="评估类型: retrieval / generation / e2e")
    top_k: int = Field(5, ge=1, le=50)


class WeightTuneRequest(BaseModel):
    questions: list[str] = Field(..., min_length=1)
    ground_truths: list[str] = Field(..., min_length=1)
    top_k: int = Field(5, ge=1, le=50)


@router.post("/run")
async def run_evaluation(
    body: EvalRunRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """运行 Ragas RAG 评估"""
    from app.services.eval_service import evaluate_rag

    result = await evaluate_rag(
        questions=body.questions,
        ground_truths=body.ground_truths,
        user_id=current_user.id,
        db=db,
        eval_type=body.eval_type,
        top_k=body.top_k,
    )
    return success(data=result)


@router.get("/history")
async def list_evaluations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查看历史评估记录"""
    result = await db.execute(
        select(EvalRecord)
        .where(EvalRecord.user_id == current_user.id)
        .order_by(EvalRecord.created_at.desc())
        .limit(50)
    )
    records = result.scalars().all()
    items = [
        {
            "id": r.id,
            "eval_type": r.eval_type,
            "metrics": r.metrics,
            "question_count": r.question_count,
            "config_snapshot": r.config_snapshot,
            "created_at": to_utc_iso(r.created_at),
        }
        for r in records
    ]
    return success(data={"items": items, "total": len(items)})


@router.get("/{eval_id}")
async def get_evaluation_detail(
    eval_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查看某次评估详情"""
    result = await db.execute(
        select(EvalRecord).where(
            EvalRecord.id == eval_id,
            EvalRecord.user_id == current_user.id,
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("评估记录不存在")
    return success(data={
        "id": record.id,
        "eval_type": record.eval_type,
        "metrics": record.metrics,
        "config_snapshot": record.config_snapshot,
        "question_count": record.question_count,
        "details": record.details,
        "created_at": to_utc_iso(record.created_at),
    })


@router.post("/tune-weights")
async def tune_weights(
    body: WeightTuneRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """自动调优混合检索权重"""
    from app.services.eval_service import tune_hybrid_weights

    result = await tune_hybrid_weights(
        questions=body.questions,
        ground_truths=body.ground_truths,
        user_id=current_user.id,
        db=db,
        top_k=body.top_k,
    )
    return success(data=result)
