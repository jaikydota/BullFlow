"""国内分发平台发布规范（后端镜像）。

前端权威版在 frontend/src/utils/tlfPlatformConstraints.ts（含 min/max/enum 细节，
负责 UI 渲染 + 客户端校验）。后端只镜像两件事：

1. 每平台支持的 publish_type（video / article / dynamic）
2. 每平台 × publish_type 支持哪些**扩展字段**（visibleType / statement / prePubTime
   / topics / tags / category / subCategory）—— 用于 submit_publish 时过滤 extras，
   只把目标平台真正认识的字段透传给上游 publishData，避免脏字段导致 400。

一致性由 backend/tests/test_publish_spec.py 断言（平台列表 + supports 两端一致）。
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KindFields:
    """某平台某 publish_type 支持的扩展字段开关。"""

    visible_type: bool = False
    statement: bool = False
    pre_pub_time: bool = False
    topics: bool = False
    tags: bool = False
    category: bool = False
    sub_category: bool = False
    # 「原创声明」走 createType 字段的平台开关（B 站 / AcFun / 网易号文章 / 车家号文章 等）
    create_type: bool = False


# platform_code -> { publish_type -> KindFields }
PUBLISH_SPEC: dict[str, dict[str, KindFields]] = {
    "DouYin": {
        "video": KindFields(visible_type=True, statement=True, pre_pub_time=True, topics=True),
        "article": KindFields(visible_type=True, pre_pub_time=True),
        "dynamic": KindFields(visible_type=True, statement=True, pre_pub_time=True, topics=True),
    },
    "XiaoHongShu": {
        "video": KindFields(visible_type=True, statement=True, pre_pub_time=True),
        "dynamic": KindFields(visible_type=True, statement=True, pre_pub_time=True, topics=True),
    },
    "KuaiShou": {
        "video": KindFields(visible_type=True, statement=True, pre_pub_time=True),
        "dynamic": KindFields(visible_type=True, statement=True, pre_pub_time=True, topics=True),
    },
    "BiLiBiLi": {
        "video": KindFields(statement=True, tags=True, pre_pub_time=True, create_type=True),
        "article": KindFields(tags=True, pre_pub_time=True, create_type=True),
    },
    "ShiPinHao": {
        "video": KindFields(pre_pub_time=True),
        "dynamic": KindFields(pre_pub_time=True),
    },
    "WeiXinGongZhongHao": {
        "article": KindFields(pre_pub_time=True),
    },
    "XinLangWeiBo": {
        "video": KindFields(pre_pub_time=True),
        "article": KindFields(),
        "dynamic": KindFields(statement=True),
    },
    "ZhiHu": {
        "article": KindFields(statement=True, tags=True),
        "dynamic": KindFields(topics=True),
    },
    "TouTiaoHao": {
        "video": KindFields(statement=True, pre_pub_time=True),
        "article": KindFields(statement=True, pre_pub_time=True),
        "dynamic": KindFields(topics=True),
    },
    "BaiJiaHao": {
        "video": KindFields(statement=True, pre_pub_time=True),
        "article": KindFields(statement=True, category=True, sub_category=True, pre_pub_time=True),
        "dynamic": KindFields(),
    },
    "DaYuHao": {
        "video": KindFields(pre_pub_time=True),
        "article": KindFields(statement=True, pre_pub_time=True),
    },
    "WangYiHao": {
        "video": KindFields(statement=True, pre_pub_time=True),
        "article": KindFields(statement=True, pre_pub_time=True, create_type=True),
    },
    "SouHuHao": {
        "video": KindFields(pre_pub_time=True),
        "article": KindFields(statement=True, pre_pub_time=True),
    },
    "QiEHao": {
        "video": KindFields(pre_pub_time=True),
        "article": KindFields(statement=True, tags=True, pre_pub_time=True),
    },
    "YiDianHao": {
        "video": KindFields(pre_pub_time=True),
        "article": KindFields(statement=True, pre_pub_time=True),
    },
    "XueQiuHao": {
        "article": KindFields(),
    },
    "KuaiChuanHao": {
        "article": KindFields(),
    },
    "AiQiYi": {
        "video": KindFields(tags=True),
        "article": KindFields(),
    },
    "TengXunShiPin": {
        "video": KindFields(tags=True),
    },
    "TengXunWeiShi": {
        "video": KindFields(),
    },
    "SouHuShiPin": {
        "video": KindFields(),
    },
    "PiPiXia": {
        "video": KindFields(),
    },
    "DuoDuoShiPin": {
        "video": KindFields(),
    },
    "MeiPai": {
        "video": KindFields(),
    },
    "ACFun": {
        "article": KindFields(tags=True, category=True, sub_category=True, create_type=True),
    },
    "DaYuHaoVideo": {
        "video": KindFields(pre_pub_time=True),
    },
    "SouHuHaoVideo": {
        "video": KindFields(pre_pub_time=True),
    },
    "BiliBiliComic": {
        "article": KindFields(),
    },
    "CheJiaHao": {
        "video": KindFields(),
        "article": KindFields(pre_pub_time=True, create_type=True),
    },
    "YiCheHao": {
        "article": KindFields(statement=True, pre_pub_time=True),
    },
    "FengWang": {
        "video": KindFields(),
    },
    "DeWu": {
        "video": KindFields(),
    },
    "MeiYou": {
        "video": KindFields(),
    },
    "XiaoHongShuShangJiaHao": {
        "video": KindFields(visible_type=True, pre_pub_time=True),
    },
    "DouBan": {
        "article": KindFields(visible_type=True),
    },
    "JianShu": {
        "article": KindFields(),
    },
    "CSDN": {
        "article": KindFields(visible_type=True, statement=True, tags=True, pre_pub_time=True),
    },
    "WiFiWanNengYaoShi": {
        "article": KindFields(),
    },
}


def get_kind_fields(platform_code: str, publish_type: str) -> KindFields | None:
    """取某平台某发布类型支持的扩展字段开关，未知返回 None。"""
    return PUBLISH_SPEC.get(platform_code, {}).get(publish_type)


def platform_supports(platform_code: str, publish_type: str) -> bool:
    """该平台是否支持给定 publish_type。未登记的平台默认放行（容错）。"""
    spec = PUBLISH_SPEC.get(platform_code)
    if spec is None:
        return True
    return publish_type in spec


# extras 入参字段名 -> 上游 publishData 字段名 + 对应 KindFields 开关属性
_EXTRA_FIELD_MAP: dict[str, tuple[str, str]] = {
    # extras key            (publishData key,   KindFields attr)
    "visible_type": ("visibleType", "visible_type"),
    "statement": ("statement", "statement"),
    "pre_pub_time": ("prePubTime", "pre_pub_time"),
    "topics": ("topics", "topics"),
    "tags": ("tags", "tags"),
    "category": ("category", "category"),
    "sub_category": ("subCategory", "sub_category"),
    "create_type": ("createType", "create_type"),
}


def build_extra_fields(
    platform_code: str,
    publish_type: str,
    extras: dict | None,
) -> dict:
    """从 extras 里挑出目标平台真正支持的字段，转成 publishData 命名。

    - 未在 _EXTRA_FIELD_MAP 中的键忽略
    - 目标平台该 publish_type 不支持的字段忽略（KindFields 开关为 False）
    - 值为 None / 空 的字段忽略
    """
    if not extras:
        return {}
    kf = get_kind_fields(platform_code, publish_type)
    if kf is None:
        return {}
    out: dict = {}
    for ekey, (pkey, attr) in _EXTRA_FIELD_MAP.items():
        if not getattr(kf, attr, False):
            continue
        val = extras.get(ekey)
        if val is None or (isinstance(val, (list, str, dict)) and len(val) == 0):
            continue
        out[pkey] = val
    return out
