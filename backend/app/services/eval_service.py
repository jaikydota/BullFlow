"""RAG 评估服务：基于 Ragas 框架评估检索和生成质量。"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.eval_record import EvalRecord

logger = logging.getLogger(__name__)


async def evaluate_rag(
    questions: list[str],
    ground_truths: list[str],
    user_id: str,
    db: AsyncSession,
    *,
    eval_type: str = "e2e",
    top_k: int = 5,
    provider: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """对一组 QA 对运行 Ragas 评估，返回聚合指标并持久化。"""
    from app.services.knowledge_service import hybrid_search
    from app.services.llm_service import llm_service

    all_contexts: list[list[str]] = []
    all_answers: list[str] = []

    for question in questions:
        chunks = await hybrid_search(
            query=question, user_id=user_id, db=db, top_k=top_k,
        )
        contexts = [c["content"] for c in chunks]
        all_contexts.append(contexts)

        if eval_type in ("generation", "e2e"):
            context_block = "\n\n".join(contexts) if contexts else ""
            messages = [
                {"role": "system", "content": f"基于以下参考内容回答问题：\n\n{context_block}"},
                {"role": "user", "content": question},
            ]
            answer = await llm_service.chat(messages, provider=provider, model=model)
            all_answers.append(answer)
        else:
            all_answers.append("")

    try:
        from datasets import Dataset
        from ragas import evaluate
        from ragas.metrics import (
            answer_relevancy,
            context_precision,
            context_recall,
            faithfulness,
        )

        eval_data = {
            "question": questions,
            "answer": all_answers,
            "contexts": all_contexts,
            "ground_truth": ground_truths,
        }
        dataset = Dataset.from_dict(eval_data)

        metrics_to_use = []
        if eval_type in ("retrieval", "e2e"):
            metrics_to_use.extend([context_precision, context_recall])
        if eval_type in ("generation", "e2e"):
            metrics_to_use.extend([faithfulness, answer_relevancy])

        result = evaluate(dataset, metrics=metrics_to_use)
        metrics_dict = {k: round(float(v), 4) for k, v in result.items() if isinstance(v, (int, float))}
    except Exception:
        logger.warning("Ragas 评估执行失败，返回空指标", exc_info=True)
        metrics_dict = {}

    config_snapshot = {
        "chunk_method": settings.CHUNK_METHOD,
        "chunk_size": settings.CHUNK_SIZE,
        "chunk_overlap": settings.CHUNK_OVERLAP,
        "hybrid_vector_weight": settings.HYBRID_VECTOR_WEIGHT,
        "hybrid_fulltext_weight": settings.HYBRID_FULLTEXT_WEIGHT,
        "query_adapter_enabled": settings.QUERY_ADAPTER_ENABLED,
        "embedding_model": settings.EMBEDDING_MODEL,
        "reranker_model": settings.RERANKER_MODEL,
    }

    details_list = []
    for i, q in enumerate(questions):
        details_list.append({
            "question": q,
            "ground_truth": ground_truths[i] if i < len(ground_truths) else "",
            "answer": all_answers[i] if i < len(all_answers) else "",
            "contexts_count": len(all_contexts[i]) if i < len(all_contexts) else 0,
        })

    record = EvalRecord(
        user_id=user_id,
        eval_type=eval_type,
        metrics=metrics_dict,
        config_snapshot=config_snapshot,
        question_count=len(questions),
        details={"items": details_list},
    )
    db.add(record)
    await db.flush()
    await db.commit()  # 返回前提交，否则前端随后刷新评估历史读到旧数据

    return {
        "eval_id": record.id,
        "eval_type": eval_type,
        "metrics": metrics_dict,
        "question_count": len(questions),
        "config_snapshot": config_snapshot,
    }


async def tune_hybrid_weights(
    questions: list[str],
    ground_truths: list[str],
    user_id: str,
    db: AsyncSession,
    *,
    top_k: int = 5,
) -> dict[str, Any]:
    """遍历多组权重组合，找到 context_precision 最高的一组。"""
    from app.services.knowledge_service import hybrid_search

    best_weights = (settings.HYBRID_VECTOR_WEIGHT, settings.HYBRID_FULLTEXT_WEIGHT)
    best_score = -1.0

    weight_candidates = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
    results_log: list[dict] = []

    original_vw = settings.HYBRID_VECTOR_WEIGHT
    original_fw = settings.HYBRID_FULLTEXT_WEIGHT

    for vw in weight_candidates:
        fw = round(1.0 - vw, 2)

        # Temporarily override weights for this evaluation run
        settings.HYBRID_VECTOR_WEIGHT = vw
        settings.HYBRID_FULLTEXT_WEIGHT = fw

        total_hit = 0
        for i, question in enumerate(questions):
            chunks = await hybrid_search(
                query=question, user_id=user_id, db=db, top_k=top_k,
            )
            retrieved_texts = [c["content"] for c in chunks]
            gt = ground_truths[i] if i < len(ground_truths) else ""
            if any(gt[:50] in rt for rt in retrieved_texts):
                total_hit += 1

        score = total_hit / len(questions) if questions else 0
        results_log.append({"vector_weight": vw, "fulltext_weight": fw, "hit_rate": score})

        if score > best_score:
            best_score = score
            best_weights = (vw, fw)

    # Restore original weights
    settings.HYBRID_VECTOR_WEIGHT = original_vw
    settings.HYBRID_FULLTEXT_WEIGHT = original_fw

    return {
        "best_vector_weight": best_weights[0],
        "best_fulltext_weight": best_weights[1],
        "best_hit_rate": best_score,
        "all_results": results_log,
    }
