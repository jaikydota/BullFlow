"""国内分发平台发布规范（后端镜像）。

下游 UI 侧（如本仓库 frontend/src/utils/tlfPlatformConstraints.ts）另有含 min/max/enum
细节的完整约束，负责 UI 渲染 + 客户端校验。本模块只维护两件事：

1. 每平台支持的 publish_type（video / article / dynamic）
2. 每平台 × publish_type 支持哪些**扩展字段**（visibleType / statement / prePubTime
   / topics / tags / category / subCategory）—— 用于 submit_publish 时过滤 extras，
   只把目标平台真正认识的字段透传给上游 publishData，避免脏字段导致 400。

与开放接口文档附录 JSON 的一致性由 scripts/check_doc_publish_spec.py 校验。
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KindFields:
    """某平台某 publish_type 支持的扩展字段开关 + 必填集合。

    布尔位 = 该字段是否「被网关放行透传」（build_extra_fields 据此过滤）。
    `required` = 该平台该 kind 上游**必填**的扩展字段名集合（snake_case），**仅作元数据**
    （供文档 §7.1 的 ᴿ、附录 JSON、后台「平台能力」端点展示）；build_extra_fields 不据此拦截。
    必填集合已逐项对照灵径推送任务接口文档各 *PlatformBody 的 `required:` 数组核定
    （注：`visible_type` 凡在某平台某 kind 存在即为必填）。
    """

    visible_type: bool = False
    statement: bool = False
    pre_pub_time: bool = False
    topics: bool = False
    tags: bool = False
    category: bool = False
    sub_category: bool = False
    # 「原创声明」走 createType 字段的平台开关（B 站 / AcFun / 网易号文章 / 车家号文章 等）
    create_type: bool = False
    # 上游必填的扩展字段名集合（snake_case），仅元数据，不参与 build_extra_fields 过滤
    required: frozenset[str] = frozenset()


# platform_code -> { publish_type -> KindFields }
PUBLISH_SPEC: dict[str, dict[str, KindFields]] = {
    # 各平台扩展字段开关已全量对照灵径推送任务接口文档的 *PlatformBody 表单核对。
    # 取值原则：某字段出现在该平台该 kind 的 schema properties 里 = True。
    # 注意：「话题(#)」对绝大多数平台是写在 desc 内的 <topic> 内联标签，不是独立 topics 字段——
    # 仅 DouYin/YiCheHao 文章、知乎文章 有独立 topics 字段。
    # required 集合源自上游 *PlatformBody.required 数组（visible_type 凡存在即必填）。
    "DouYin": {
        "video": KindFields(visible_type=True, statement=True, pre_pub_time=True, required=frozenset({"visible_type"})),
        "article": KindFields(visible_type=True, pre_pub_time=True, topics=True, required=frozenset({"visible_type"})),
        "dynamic": KindFields(visible_type=True, statement=True, pre_pub_time=True, required=frozenset({"visible_type"})),
    },
    "XiaoHongShu": {
        "video": KindFields(visible_type=True, statement=True, pre_pub_time=True, create_type=True, required=frozenset({"visible_type"})),
        "dynamic": KindFields(visible_type=True, statement=True, pre_pub_time=True, required=frozenset({"visible_type"})),
    },
    "KuaiShou": {
        "video": KindFields(visible_type=True, statement=True, pre_pub_time=True, required=frozenset({"visible_type"})),
        "dynamic": KindFields(visible_type=True, statement=True, pre_pub_time=True, required=frozenset({"visible_type"})),
    },
    "BiLiBiLi": {
        "video": KindFields(statement=True, tags=True, category=True, pre_pub_time=True, create_type=True, required=frozenset({"tags", "category"})),
        "article": KindFields(tags=True, category=True, sub_category=True, pre_pub_time=True, create_type=True),
    },
    "ShiPinHao": {
        "video": KindFields(pre_pub_time=True, create_type=True, required=frozenset({"create_type"})),
        "dynamic": KindFields(pre_pub_time=True),
    },
    "WeiXinGongZhongHao": {
        # 公众号正文/原创等在嵌套 contentList[].contentItem 内，扁平 extras 仅 prePubTime
        "article": KindFields(pre_pub_time=True),
    },
    "XinLangWeiBo": {
        # 微博视频 visibleType(0公开/1私密) + createType 必填
        "video": KindFields(visible_type=True, pre_pub_time=True, category=True, sub_category=True, create_type=True, required=frozenset({"visible_type", "create_type"})),
        "article": KindFields(pre_pub_time=True),
        # 微博图文 visibleType 必填
        "dynamic": KindFields(visible_type=True, statement=True, pre_pub_time=True, required=frozenset({"visible_type"})),
    },
    "ZhiHu": {
        # 知乎用独立 topics(话题，最多3) 字段，不是 tags
        "article": KindFields(statement=True, topics=True),
        "dynamic": KindFields(),
    },
    "TouTiaoHao": {
        "video": KindFields(visible_type=True, statement=True, tags=True, pre_pub_time=True, required=frozenset({"visible_type", "tags"})),
        "article": KindFields(statement=True, pre_pub_time=True),
        "dynamic": KindFields(statement=True),
    },
    "BaiJiaHao": {
        "video": KindFields(statement=True, pre_pub_time=True),
        "article": KindFields(statement=True, category=True, sub_category=True, pre_pub_time=True, required=frozenset({"category", "sub_category"})),
        "dynamic": KindFields(statement=True, pre_pub_time=True),
    },
    "DaYuHao": {
        "video": KindFields(statement=True, tags=True, category=True, pre_pub_time=True, create_type=True, required=frozenset({"tags"})),
        "article": KindFields(statement=True, pre_pub_time=True),
    },
    "WangYiHao": {
        "video": KindFields(statement=True, tags=True, category=True, sub_category=True, pre_pub_time=True, create_type=True, required=frozenset({"tags", "category", "sub_category"})),
        "article": KindFields(statement=True, pre_pub_time=True, create_type=True, required=frozenset({"create_type"})),
    },
    "SouHuHao": {
        "video": KindFields(statement=True, tags=True, category=True, sub_category=True, pre_pub_time=True, required=frozenset({"tags", "category", "sub_category"})),
        "article": KindFields(statement=True, pre_pub_time=True),
    },
    "QiEHao": {
        "video": KindFields(statement=True, tags=True, category=True, sub_category=True, pre_pub_time=True, required=frozenset({"tags", "category", "sub_category"})),
        "article": KindFields(statement=True, tags=True, pre_pub_time=True),
    },
    "YiDianHao": {
        "video": KindFields(statement=True, tags=True, category=True, sub_category=True, pre_pub_time=True, create_type=True, required=frozenset({"tags", "category", "sub_category"})),
        "article": KindFields(statement=True, pre_pub_time=True),
    },
    "XueQiuHao": {
        "article": KindFields(visible_type=True, statement=True, required=frozenset({"visible_type"})),
    },
    "KuaiChuanHao": {
        "article": KindFields(tags=True, pre_pub_time=True, create_type=True, required=frozenset({"create_type"})),
    },
    "AiQiYi": {
        "video": KindFields(statement=True, tags=True, category=True, pre_pub_time=True, create_type=True, required=frozenset({"tags", "category", "create_type"})),
        "article": KindFields(),
    },
    "TengXunShiPin": {
        "video": KindFields(statement=True, tags=True, pre_pub_time=True),
    },
    "TengXunWeiShi": {
        "video": KindFields(visible_type=True, pre_pub_time=True, required=frozenset({"visible_type"})),
    },
    "SouHuShiPin": {
        "video": KindFields(visible_type=True, statement=True, tags=True, required=frozenset({"visible_type"})),
    },
    "PiPiXia": {
        "video": KindFields(),
    },
    "DuoDuoShiPin": {
        "video": KindFields(statement=True, pre_pub_time=True),
    },
    "MeiPai": {
        "video": KindFields(category=True, sub_category=True, pre_pub_time=True),
    },
    "ACFun": {
        "article": KindFields(tags=True, category=True, sub_category=True, create_type=True, required=frozenset({"category", "sub_category", "create_type"})),
    },
    "DaYuHaoVideo": {
        "video": KindFields(statement=True, tags=True, category=True, pre_pub_time=True, create_type=True, required=frozenset({"tags"})),
    },
    "SouHuHaoVideo": {
        "video": KindFields(statement=True, tags=True, category=True, sub_category=True, pre_pub_time=True, required=frozenset({"tags", "category", "sub_category"})),
    },
    "BiliBiliComic": {
        # 文档无对应 *PlatformBody schema，保持空（仅基础内容字段）
        "article": KindFields(),
    },
    "CheJiaHao": {
        "video": KindFields(pre_pub_time=True, create_type=True),
        "article": KindFields(pre_pub_time=True, create_type=True),
    },
    "YiCheHao": {
        "article": KindFields(statement=True, pre_pub_time=True, topics=True),
    },
    "FengWang": {
        "video": KindFields(tags=True, category=True, sub_category=True, pre_pub_time=True, required=frozenset({"tags", "category", "sub_category"})),
    },
    "DeWu": {
        "video": KindFields(visible_type=True, statement=True, required=frozenset({"visible_type"})),
    },
    "MeiYou": {
        "video": KindFields(pre_pub_time=True),
    },
    "XiaoHongShuShangJiaHao": {
        "video": KindFields(visible_type=True, pre_pub_time=True, required=frozenset({"visible_type"})),
    },
    "DouBan": {
        "article": KindFields(visible_type=True, tags=True, create_type=True, required=frozenset({"visible_type", "create_type"})),
    },
    "JianShu": {
        "article": KindFields(),
    },
    "CSDN": {
        "article": KindFields(visible_type=True, statement=True, tags=True, pre_pub_time=True, create_type=True, required=frozenset({"visible_type", "tags", "create_type"})),
    },
    "WiFiWanNengYaoShi": {
        "article": KindFields(category=True),
    },
}


def get_kind_fields(platform_code: str, publish_type: str) -> KindFields | None:
    """取某平台某发布类型支持的扩展字段开关，未知返回 None。"""
    return PUBLISH_SPEC.get(platform_code, {}).get(publish_type)


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


# 扩展字段稳定输出顺序（KindFields 属性名 == extras key）
_EXTRA_FIELD_ORDER = (
    "visible_type", "statement", "create_type", "pre_pub_time",
    "topics", "tags", "category", "sub_category",
)


def platform_field_matrix() -> list[dict]:
    """导出每平台每 kind 的扩展字段「支持 + 必填」矩阵。

    供后台「平台能力」端点、文档附录 JSON 与防漂移校验共用——单一真源。
    结构：[{platform_code, kinds:[...], fields:{kind:[{field, required}]}}]
    """
    out: list[dict] = []
    for code, kinds in PUBLISH_SPEC.items():
        entry: dict = {"platform_code": code, "kinds": list(kinds.keys()), "fields": {}}
        for kind, kf in kinds.items():
            entry["fields"][kind] = [
                {"field": ekey, "required": ekey in kf.required}
                for ekey in _EXTRA_FIELD_ORDER
                if getattr(kf, ekey, False)
            ]
        out.append(entry)
    return out
