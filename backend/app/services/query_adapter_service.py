"""Query Adapter: 正交 Procrustes 变换优化查询向量。

借鉴 RAGLite 的核心算法：
1. 对每个 query，检索 top_k 结果中分离 positive/negative chunks
2. 通过约束最小二乘求解每个 query 的最优 target 向量 t*
3. 用 Procrustes 正交变换求解 query→target 的最优映射矩阵 W
4. 检索时用 W 变换 query embedding 提升精度
"""

from __future__ import annotations

import logging
import os

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

_adapter_matrix: np.ndarray | None = None


def _optimize_query_target(
    q: np.ndarray,
    P: np.ndarray,
    N: np.ndarray,
    *,
    alpha: float = 0.05,
) -> np.ndarray:
    """求解单个 query 的最优 target 向量。

    借鉴 RAGLite: 找到最接近 q 的向量 t*，使得 t* 将所有 positive chunks
    与所有 negative chunks 以至少 alpha 的间距分开。

    t* = q + D^T @ mu*
    其中 mu* = argmin ||q + D^T @ mu||^2  s.t. mu >= 0
    D = [p_m^T - (1+alpha) * n_n^T]_{m,n}
    """
    # 懒加载 scipy.optimize：模块顶部 import 会拖慢应用启动 500-900ms
    from scipy.optimize import lsq_linear

    q64, P64, N64 = q.astype(np.float64), P.astype(np.float64), N.astype(np.float64)

    D = np.reshape(
        P64[:, np.newaxis, :] - (1.0 + alpha) * N64[np.newaxis, :, :],
        (-1, P64.shape[1]),
    )

    result = lsq_linear(D.T, -q64, bounds=(0.0, np.inf), tol=np.finfo(np.float64).eps)
    t_star = (q64 + D.T @ result.x).astype(q.dtype)
    return t_star


def compute_procrustes_adapter(
    query_embeddings: np.ndarray,
    target_embeddings: np.ndarray,
) -> np.ndarray:
    """求解正交 Procrustes 问题: max trace(M^T A) s.t. A^T A = I

    对于 cosine 距离度量:  A* = U @ V^T, 其中 U, S, V^T = SVD(M)
    M = (1/n) * T^T @ Q + (I - Q^T @ pinv(Q @ Q^T) @ Q)  (补偿欠秩)
    """
    n, d = query_embeddings.shape

    Q = query_embeddings.astype(np.float64)
    T = target_embeddings.astype(np.float64)

    # Normalize
    Q = Q / np.linalg.norm(Q, axis=1, keepdims=True)
    T = T / np.linalg.norm(T, axis=1, keepdims=True)

    M = (1.0 / n) * T.T @ Q
    if n < d or np.linalg.matrix_rank(Q) < d:
        M += np.eye(d) - Q.T @ np.linalg.pinv(Q @ Q.T) @ Q

    U, _, Vt = np.linalg.svd(M, full_matrices=False)
    W = U @ Vt
    return W.astype(np.float32)


def apply_adapter(query_vector: list[float]) -> list[float]:
    """将查询向量通过 adapter 矩阵变换。如果没有 adapter 则原样返回。"""
    if _adapter_matrix is None:
        return query_vector
    q = np.array(query_vector, dtype=np.float32)
    transformed = _adapter_matrix @ q
    norm = np.linalg.norm(transformed)
    if norm > 0:
        transformed = transformed / norm
    return transformed.tolist()


def load_adapter() -> bool:
    """从文件加载预训练的 adapter 矩阵。返回是否加载成功。"""
    global _adapter_matrix

    if not settings.QUERY_ADAPTER_ENABLED:
        logger.info("Query Adapter 已禁用")
        return False

    adapter_path = settings.QUERY_ADAPTER_PATH
    if not os.path.exists(adapter_path):
        logger.info("Query Adapter 文件不存在: %s", adapter_path)
        return False

    try:
        _adapter_matrix = np.load(adapter_path)
        logger.info(
            "Query Adapter 加载成功: shape=%s, path=%s",
            _adapter_matrix.shape,
            adapter_path,
        )
        return True
    except Exception:
        logger.warning("Query Adapter 加载失败", exc_info=True)
        _adapter_matrix = None
        return False


def save_adapter(W: np.ndarray) -> None:
    """保存 adapter 矩阵到文件。"""
    global _adapter_matrix

    adapter_path = settings.QUERY_ADAPTER_PATH
    os.makedirs(os.path.dirname(adapter_path) or ".", exist_ok=True)
    np.save(adapter_path, W)
    _adapter_matrix = W
    logger.info("Query Adapter 保存成功: shape=%s, path=%s", W.shape, adapter_path)


async def train_adapter_from_evals(
    questions: list[str],
    relevant_chunk_ids: list[list[str]],
    *,
    optimize_top_k: int = 40,
    optimize_gap: float = 0.05,
) -> np.ndarray:
    """从 question-chunk 正例对训练 adapter（借鉴 RAGLite 完整流程）。

    1. 编码所有 questions → query_embeddings
    2. 对每个 question 做 vector_search 获取 top_k 结果
    3. 区分 positive/negative chunks，求解最优 target 向量
    4. 计算 Procrustes adapter 矩阵
    5. 保存到文件
    """
    from app.services.embedding_service import encode_texts, search_text_embeddings

    logger.info(
        "开始训练 Query Adapter: %d 个 QA 对, top_k=%d, gap=%.2f",
        len(questions),
        optimize_top_k,
        optimize_gap,
    )

    query_embeddings_list = await encode_texts(questions)

    from app.core.milvus import TEXT_COLLECTION, get_milvus

    client = get_milvus()

    Q_list: list[np.ndarray] = []
    T_list: list[np.ndarray] = []

    for i, (question, q_emb) in enumerate(zip(questions, query_embeddings_list)):
        q = np.array(q_emb, dtype=np.float32)

        # Retrieve top_k chunks for this query (without adapter)
        try:
            hits = await search_text_embeddings(
                q.tolist(), "all", top_k=optimize_top_k
            )
        except Exception:
            continue

        if not hits:
            continue

        hit_ids = [h.get("id", h.get("chunk_id", "")) for h in hits]
        relevant_set = set(relevant_chunk_ids[i]) if i < len(relevant_chunk_ids) else set()

        # Classify into positive and negative
        is_relevant = [hid in relevant_set for hid in hit_ids]
        if not any(is_relevant) or all(is_relevant):
            continue

        # Get embeddings from Milvus
        try:
            chunk_results = client.get(
                collection_name=TEXT_COLLECTION,
                ids=hit_ids,
                output_fields=["embedding"],
            )
        except Exception:
            continue

        id_to_emb = {item["id"]: np.array(item["embedding"], dtype=np.float32) for item in chunk_results}

        pos_embs = [id_to_emb[hid] for hid, rel in zip(hit_ids, is_relevant) if rel and hid in id_to_emb]
        neg_embs = [id_to_emb[hid] for hid, rel in zip(hit_ids, is_relevant) if not rel and hid in id_to_emb]

        if not pos_embs or not neg_embs:
            continue

        P = np.vstack(pos_embs)
        N = np.vstack(neg_embs)

        t_star = _optimize_query_target(q, P, N, alpha=optimize_gap)

        Q_list.append(q)
        T_list.append(t_star)

    if len(Q_list) < 5:
        raise ValueError(
            f"有效 QA 对不足（需要至少 5 个，实际 {len(Q_list)} 个）"
        )

    Q_mat = np.vstack(Q_list)
    T_mat = np.vstack(T_list)

    W = compute_procrustes_adapter(Q_mat, T_mat)
    save_adapter(W)

    logger.info("Query Adapter 训练完成: 使用 %d 个有效 QA 对", len(Q_list))
    return W
