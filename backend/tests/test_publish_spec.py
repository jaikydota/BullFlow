"""国内分发发布规范一致性 + 扩展字段透传单测。

校验：
1. 后端 PUBLISH_SPEC 的平台 code 与前端 tlfPlatformConstraints.ts 完全一致
2. 后端每平台 supports 的 publish_type 在前端 constraint 中也声明
3. build_extra_fields 按平台 spec 正确过滤 / 重命名扩展字段
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services.tlf_publish_spec import (
    PUBLISH_SPEC,
    build_extra_fields,
    get_kind_fields,
    platform_supports,
)

# frontend constraints 文件路径（前端与 backend 同级，在 repo 根下）
_FRONTEND_CONSTRAINTS = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "src"
    / "utils"
    / "tlfPlatformConstraints.ts"
)


def _extract_frontend_platforms() -> dict[str, set[str]]:
    """从 TS 文件提取 TLF_PLATFORM_CONSTRAINTS 的平台 code -> supports 集合。

    解析策略：
    - 平台块以注释 `/* ========== 名称 Code ========== */` 起头，紧跟 `  Code: {`
    - supports 行形如 `supports: ['video', 'article', 'dynamic'],`
    """
    text = _FRONTEND_CONSTRAINTS.read_text(encoding="utf-8")
    # 截取 TLF_PLATFORM_CONSTRAINTS = { ... } 区块（到 helpers 注释为止）
    start = text.index("TLF_PLATFORM_CONSTRAINTS")
    end = text.index("/* ──────────────── helpers", start)
    block = text[start:end]

    platforms: dict[str, set[str]] = {}
    # 2 空格缩进的平台 key：`  DouYin: {`
    for m in re.finditer(r"^  ([A-Za-z][A-Za-z0-9]*): \{", block, re.MULTILINE):
        code = m.group(1)
        # 找该平台块内的 supports 行（取该 key 之后到下一个 2 空格 key 之前）
        seg_start = m.end()
        next_m = re.search(r"^  [A-Za-z][A-Za-z0-9]*: \{", block[seg_start:], re.MULTILINE)
        seg = block[seg_start : seg_start + (next_m.start() if next_m else len(block))]
        sup_m = re.search(r"supports:\s*\[([^\]]*)\]", seg)
        supports: set[str] = set()
        if sup_m:
            supports = {s.strip().strip("'\"") for s in sup_m.group(1).split(",") if s.strip()}
        platforms[code] = supports
    return platforms


def test_frontend_file_exists():
    assert _FRONTEND_CONSTRAINTS.exists(), f"找不到前端约束文件：{_FRONTEND_CONSTRAINTS}"


def test_platform_codes_match_frontend():
    fe = _extract_frontend_platforms()
    be = set(PUBLISH_SPEC.keys())
    fe_codes = set(fe.keys())
    assert be == fe_codes, (
        f"前后端平台 code 不一致：\n"
        f"  后端独有: {sorted(be - fe_codes)}\n"
        f"  前端独有: {sorted(fe_codes - be)}"
    )


def test_supports_match_frontend():
    """后端每平台的 publish_type 集合应与前端 supports 一致。"""
    fe = _extract_frontend_platforms()
    mismatches = []
    for code, kinds in PUBLISH_SPEC.items():
        be_types = set(kinds.keys())
        fe_types = fe.get(code, set())
        if fe_types and be_types != fe_types:
            mismatches.append(f"{code}: 后端 {sorted(be_types)} vs 前端 {sorted(fe_types)}")
    assert not mismatches, "supports 不一致:\n" + "\n".join(mismatches)


def test_every_platform_has_at_least_one_kind():
    for code, kinds in PUBLISH_SPEC.items():
        assert len(kinds) >= 1, f"{code} 没有任何 publish_type"


def test_platform_supports_helper():
    assert platform_supports("DouYin", "video") is True
    assert platform_supports("XiaoHongShu", "article") is False  # 小红书不支持文章
    assert platform_supports("WeiXinGongZhongHao", "article") is True
    assert platform_supports("WeiXinGongZhongHao", "video") is False
    # 未登记平台默认放行
    assert platform_supports("UnknownPlatform", "video") is True


def test_build_extra_fields_filters_by_spec():
    extras = {
        "visible_type": 1,
        "statement": 3,
        "pre_pub_time": 1779999999000,
        "topics": ["旅行"],
        "tags": ["标签A"],
    }
    # 抖音视频：支持 visibleType / statement / prePubTime / topics，不支持 tags
    out = build_extra_fields("DouYin", "video", extras)
    assert out == {
        "visibleType": 1,
        "statement": 3,
        "prePubTime": 1779999999000,
        "topics": ["旅行"],
    }
    assert "tags" not in out


def test_build_extra_fields_bilibili_tags():
    extras = {"tags": ["科技", "数码"], "visible_type": 0}
    # B 站视频：支持 tags，不支持 visibleType
    out = build_extra_fields("BiLiBiLi", "video", extras)
    assert out == {"tags": ["科技", "数码"]}
    assert "visibleType" not in out


def test_build_extra_fields_skips_empty_and_none():
    extras = {"visible_type": None, "topics": [], "statement": 3}
    out = build_extra_fields("DouYin", "video", extras)
    assert out == {"statement": 3}


def test_build_extra_fields_unknown_platform():
    assert build_extra_fields("Nope", "video", {"visible_type": 1}) == {}


def test_get_kind_fields():
    kf = get_kind_fields("DouYin", "video")
    assert kf is not None and kf.visible_type and kf.statement and kf.pre_pub_time
    assert get_kind_fields("DouYin", "nonexist") is None
