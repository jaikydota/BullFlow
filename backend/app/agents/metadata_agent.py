"""发布元数据生成 agent：根据生成的内容（文章正文 / 图片·视频提示词）产出
适合社媒发布的 {标题, 描述, 标签}，供「国内发布」自动填充。

设计要点：
- 复用单例 ``llm_service``，**不传 provider/model**，走 ``settings.DEFAULT_LLM_PROVIDER`` 的默认模型。
- 「分发资料」生成（generate_publish_metadata / generate_dynamic_post）**开启 enable_thinking**
  提升标题/文案质量；reasoning 模型的思考 token 计入 max_completion_tokens，故预算调大到 4096
  （avoid 思考耗尽预算导致 JSON 输出为空）。prompt 优化类函数（optimize_*）仍走快速无思考。
- 整函数 try/except，任何异常/解析失败都返回 ``{}``——绝不让元数据问题连坐生成主流程。
"""
from __future__ import annotations

import json
import logging

from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)

# 入参正文截断上限：标题/标签只需开头语义，超长正文徒增 token
_MAX_TEXT_CHARS = 4000
# 标签最多保留条数（防止 LLM 返回过多）
_MAX_TAGS = 8

_TYPE_LABEL = {
    "article": "一篇文章",
    "image": "一张配图（以下是它的生成提示词）",
    "video": "一条短视频（以下是它的生成提示词）",
}

_SYSTEM_PROMPT = """你是社交媒体运营助手。请根据用户提供的内容，生成适合在社交媒体平台发布的元数据。

【严格要求】
1. 只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块包裹。
2. JSON 结构固定为：{"title": "...", "description": "...", "tags": ["...", "..."]}
3. title：简洁有吸引力的标题，不超过 30 个字，不带书名号/引号。
4. description：适合社媒发布的简介或文案，不超过 120 个字，自然通顺、可直接发布。
5. tags：3 到 8 个关键词标签，每个不带 # 号、不带空格，紧扣内容主题。
6. 全部使用简体中文（除非内容本身是外文）。"""

# 「图文动态」发布文案写手：入参是配图的【画面生成提示词】，但要写「给人看的文案」而非复述画面。
# 用于图片生成勾选「生成发布动态」时，替代上面的通用 metadata（后者会把画面描述照抄成文案）。
_DYNAMIC_POST_SYSTEM_PROMPT = """你是社交媒体「图文动态」文案写手，擅长小红书 / 微博 / 朋友圈 等图文笔记风格。

用户给你的是一组配图的【画面生成描述】（以及可选品牌信息）——那是用来画图的，**不是文案**。
请基于它的主题与卖点，**面向真实读者**写一条可直接发布的图文动态文案，而不是复述这张图长什么样。

【写作要求】
- 像真人发帖：钩子开头 + 场景/情绪共鸣 + 口语化，分 2–4 个短句/短段，可适度用 emoji（别堆砌）。
- 紧扣配图主题，写「种草/分享/安利」的文案，**禁止**出现「竖版」「左上大字排版」「胶片质感」这类画面/构图描述。
- 结尾带一句轻互动（提问 / 号召），不要营销口号轰炸、不要空洞形容词堆砌。
- 正文 60–180 字。

【严格输出】
1. 只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块包裹。
2. 结构固定：{"title": "...", "description": "...", "tags": ["...", "..."]}
3. title：有点击欲的标题/首句，不超过 20 字，不带书名号/引号。
4. description：可直接发布的图文动态正文（即上面的写作要求）。
5. tags：3 到 8 个话题关键词，每个不带 # 号、不带空格，紧扣内容。
6. 全部使用简体中文（除非内容本身是外文）。"""


def _strip_code_fence(raw: str) -> str:
    """剥离 ```json ... ``` 代码块围栏，返回纯 JSON 文本。"""
    s = (raw or "").strip()
    if s.startswith("```"):
        # 去掉首行 ``` 或 ```json
        s = s.split("\n", 1)[-1] if "\n" in s else s
        if s.endswith("```"):
            s = s[: -3]
    return s.strip()


def _parse_meta(raw: str) -> dict:
    """解析 LLM 返回的 {title, description, tags} JSON，做清洗 + 类型校验。失败返回 {}。"""
    data = json.loads(_strip_code_fence(raw))
    if not isinstance(data, dict):
        return {}
    out: dict = {}
    title = data.get("title")
    if isinstance(title, str) and title.strip():
        out["title"] = title.strip()[:200]
    desc = data.get("description")
    if isinstance(desc, str) and desc.strip():
        out["description"] = desc.strip()
    tags = data.get("tags")
    if isinstance(tags, list):
        clean = [str(t).strip().lstrip("#").strip() for t in tags]
        clean = [t for t in clean if t][:_MAX_TAGS]
        if clean:
            out["tags"] = clean
    return out


async def generate_publish_metadata(
    *,
    content_type: str,
    text: str,
    brand_info: str | None = None,
) -> dict:
    """生成发布元数据 {title, description, tags}。失败返回 {}。

    :param content_type: article / image / video
    :param text: 文章传正文；图片/视频传生成提示词
    :param brand_info: 可选品牌信息，辅助贴合品牌调性
    """
    if not text or not text.strip():
        return {}

    label = _TYPE_LABEL.get(content_type, "一段内容")
    user_parts = [f"内容类型：{label}", "", text.strip()[:_MAX_TEXT_CHARS]]
    if brand_info and brand_info.strip():
        user_parts += ["", "【品牌参考信息】", brand_info.strip()]
    user_prompt = "\n".join(user_parts)

    try:
        raw = await llm_service.chat(
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
            # 开启深度思考提升标题/文案质量。注意 reasoning 模型(azure GPT-5)的思考 token
            # 计入 max_completion_tokens，故调大到 4096，避免思考耗尽预算导致输出为空。
            enable_thinking=True,
            max_completion_tokens=4096,
        )
        return _parse_meta(raw)
    except Exception:  # noqa: BLE001
        logger.warning("generate_publish_metadata 失败（content_type=%s），返回空元数据", content_type, exc_info=True)
        return {}


_DERIVE_IMG_SYSTEM = """你是文章配图策划。根据给定的文章内容，提炼出 {n} 处最适合配图的画面描述，供文生图使用。

【严格输出】
1. 只输出一个 JSON 数组，不要任何解释、不要 markdown 代码块包裹。
2. 结构：["画面描述1", "画面描述2", ...]，正好 {n} 个元素。
3. 每个描述是具体、可画的画面（场景 / 主体 / 风格 / 氛围），紧扣文章相应内容，不超过 40 字。
4. 全部简体中文。"""


async def derive_image_prompts(article_text: str, n: int) -> list[str]:
    """兜底：模型没在正文标注 [[IMG:]] 时，基于文章正文提炼 n 个配图画面描述（用于文生图）。失败返回 []。"""
    if not article_text or not article_text.strip() or n <= 0:
        return []
    try:
        raw = await llm_service.chat(
            messages=[
                {"role": "system", "content": _DERIVE_IMG_SYSTEM.format(n=n)},
                {"role": "user", "content": article_text.strip()[:_MAX_TEXT_CHARS]},
            ],
            temperature=0.5,
            max_completion_tokens=400,
        )
        data = json.loads(_strip_code_fence(raw))
        if isinstance(data, list):
            return [str(x).strip() for x in data if str(x).strip()][:n]
        return []
    except Exception:  # noqa: BLE001
        logger.warning("derive_image_prompts 失败，返回空", exc_info=True)
        return []


# 生图「创作大师」是提示词工程类 skill（把简单需求扩写成专业文生图提示词），需经一次 LLM 优化，
# 而非直接拼到生图 prompt（图像模型不会执行「你是提示词专家…」这类指令）。
_IMG_OPTIMIZE_WRAP = """请严格依据上面的方法 / 风格指引，把下面的「画面需求」扩写成一段**可直接用于文生图模型**的高质量画面描述提示词。
只输出最终提示词正文本身（一段连贯的画面描述即可），**不要**输出 JSON、不要分点编号、不要解释说明、不要负向提示词清单、不要「英文版/中文版」之类标签。"""


async def optimize_image_prompt(user_prompt: str, skill_prompt: str, brand_info: str | None = None) -> str:
    """用「创作大师」skill 作 system，把用户的画面需求优化成可直接生图的提示词。失败/异常回退原始需求。"""
    from app.services.llm_service import log_system_layers

    if not skill_prompt or not skill_prompt.strip():
        return user_prompt

    parts = [f"【画面需求】\n{user_prompt.strip()}"]
    if brand_info and brand_info.strip():
        parts.append(f"【品牌 / 参考信息】\n{brand_info.strip()}")
    parts.append(_IMG_OPTIMIZE_WRAP)
    user_msg = "\n\n".join(parts)

    log_system_layers([
        ("生图技巧(创作大师)", skill_prompt),
        ("画面需求", user_prompt),
        ("品牌/参考", brand_info),
    ], title="生图提示词优化")

    try:
        raw = await llm_service.chat(
            messages=[
                {"role": "system", "content": skill_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.7,
            max_completion_tokens=700,
        )
        out = _strip_code_fence((raw or "").strip())
        # 万一仍吐 JSON（少数 skill 强制 JSON 输出），不喂给图像模型，回退原始需求
        if not out or out.lstrip().startswith("{"):
            return user_prompt
        return out
    except Exception:  # noqa: BLE001
        logger.warning("optimize_image_prompt 失败，回退原始画面需求", exc_info=True)
        return user_prompt


# 生视频「创作大师」同理是提示词工程类 skill，需经一次 LLM 优化成「可直接喂视频模型」的镜头/画面描述，
# 而非把 skill 规则原文拼到 prompt（Seedance / Kling 只会逐字渲染，不会执行「你是提示词专家…」指令）。
_VIDEO_OPTIMIZE_WRAP = """请严格依据上面的方法 / 风格指引，把下面的「视频需求」扩写成一段**可直接用于文生视频模型（如 Seedance / Kling）**的高质量提示词。
聚焦画面主体、场景、动作 / 运镜、光影氛围与风格，写成一段连贯的镜头化画面描述。
只输出最终提示词正文本身，**不要**输出 JSON、不要分点编号、不要解释说明、不要负向提示词清单、不要「英文版/中文版」之类标签、不要镜头时间码。"""


async def optimize_video_prompt(user_prompt: str, skill_prompt: str, brand_info: str | None = None) -> str:
    """用「创作大师」skill 作 system，把用户的视频需求优化成可直接喂视频模型的提示词。失败/异常回退原始需求。"""
    from app.services.llm_service import log_system_layers

    if not skill_prompt or not skill_prompt.strip():
        return user_prompt

    parts = [f"【视频需求】\n{user_prompt.strip()}"]
    if brand_info and brand_info.strip():
        parts.append(f"【品牌 / 参考信息】\n{brand_info.strip()}")
    parts.append(_VIDEO_OPTIMIZE_WRAP)
    user_msg = "\n\n".join(parts)

    log_system_layers([
        ("生视频技巧(创作大师)", skill_prompt),
        ("视频需求", user_prompt),
        ("品牌/参考", brand_info),
    ], title="生视频提示词优化")

    try:
        raw = await llm_service.chat(
            messages=[
                {"role": "system", "content": skill_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.7,
            max_completion_tokens=700,
        )
        out = _strip_code_fence((raw or "").strip())
        if not out or out.lstrip().startswith("{"):
            return user_prompt
        return out
    except Exception:  # noqa: BLE001
        logger.warning("optimize_video_prompt 失败，回退原始视频需求", exc_info=True)
        return user_prompt


async def generate_dynamic_post(*, prompt: str, brand_info: str | None = None) -> dict:
    """为「图文动态」（多图 + 文案）生成可直接发布的 {title, description(文案), tags}。

    入参是配图的**生成提示词**（画面描述）；用专门的图文文案写手系统提示词，写「给人看的种草文案」，
    而非像通用 metadata 那样复述画面。供图片生成勾选「生成发布动态」时使用。失败返回 {}。
    """
    from app.services.llm_service import log_system_layers

    if not prompt or not prompt.strip():
        return {}

    user_parts = ["【配图的画面描述（仅供把握主题，禁止照抄成文案）】", prompt.strip()[:_MAX_TEXT_CHARS]]
    if brand_info and brand_info.strip():
        user_parts += ["", "【品牌参考信息】", brand_info.strip()]
    user_prompt = "\n".join(user_parts)

    # 分层日志，便于排查动态文案为何不理想
    log_system_layers([
        ("图文文案写手", _DYNAMIC_POST_SYSTEM_PROMPT),
        ("配图画面描述", prompt),
        ("品牌/参考内容", brand_info),
    ], title="图文动态文案")

    try:
        raw = await llm_service.chat(
            messages=[
                {"role": "system", "content": _DYNAMIC_POST_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.85,  # 文案要更生动有创意
            # 开启深度思考提升文案质量；reasoning token 计入预算，故调大到 4096
            enable_thinking=True,
            max_completion_tokens=4096,
        )
        return _parse_meta(raw)
    except Exception:  # noqa: BLE001
        logger.warning("generate_dynamic_post 失败，返回空文案", exc_info=True)
        return {}
