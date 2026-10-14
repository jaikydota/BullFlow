"""种子脚本：把 skills_data.json 灌入 skill 池（按 slug 幂等 upsert）。

skills_data.json 由从 skillhub 爬取的真实 SKILL.md 整理而来（content-creation 类、
无需 API_KEY 的纯提示词技能；已剔除依赖 playwright/python 脚本等工具型 skill）。
要更新/扩充：重跑爬取流程刷新 skills_data.json，或直接在后台管理增删改。

用法（backend 目录，需能连本地 DB）：
    python -m scripts.seed_skills
    python scripts/seed_skills.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select  # noqa: E402

from app.core.database import async_session_factory  # noqa: E402
from app.models.skill import Skill  # noqa: E402

_DATA_FILE = os.path.join(os.path.dirname(__file__), "skills_data.json")


def _load() -> list[dict]:
    with open(_DATA_FILE, encoding="utf-8") as f:
        return json.load(f)


async def main() -> None:
    skills = _load()
    created = updated = 0
    async with async_session_factory() as db:
        for i, d in enumerate(skills):
            slug = d["slug"]
            row = (await db.execute(select(Skill).where(Skill.slug == slug))).scalar_one_or_none()
            fields = dict(
                name=d["name"],
                description=(d.get("description") or "")[:480] or None,
                prompt=d["prompt"],
                content_types=d.get("content_types") or [],
                platforms=d.get("platforms") or [],
                category=d.get("category"),
                icon=d.get("icon"),
                source_url=d.get("source_url"),
                recommended=bool(d.get("recommended", False)),
                sort_order=i,
            )
            if row is None:
                db.add(Skill(slug=slug, status="active", **fields))
                created += 1
            else:
                for k, v in fields.items():
                    setattr(row, k, v)
                updated += 1
        await db.commit()
    print(f"[seed_skills] created={created} updated={updated} total={len(skills)}")


if __name__ == "__main__":
    asyncio.run(main())
