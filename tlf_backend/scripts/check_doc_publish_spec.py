"""防漂移校验：开放接口文档附录 JSON 必须与 publish_spec.py 的字段矩阵完全一致。

校验 docs/推量发开放接口文档.md「附录：机器可读规格（JSON）」里每平台每 kind 的
`extra_fields`（支持的扩展字段集合）与 `required`（必填集合），与
`tlf_app.services.publish_spec.platform_field_matrix()` 逐项相等（0 mismatch）。

用法（tlf_backend 目录）：python scripts/check_doc_publish_spec.py
有任何不一致 → 打印差异并以非 0 退出。
"""
from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tlf_app.services.publish_spec import platform_field_matrix  # noqa: E402

DOC = os.path.join(os.path.dirname(__file__), "..", "docs", "推量发开放接口文档.md")


def _extract_appendix_json(md: str) -> dict:
    # 取「附录」之后的第一个 ```json ... ``` 代码块
    idx = md.find("## 附录")
    if idx == -1:
        raise SystemExit("文档未找到「## 附录」段落")
    m = re.search(r"```json\s*(\{.*?\})\s*```", md[idx:], re.S)
    if not m:
        raise SystemExit("附录未找到 ```json 代码块")
    return json.loads(m.group(1))


def _spec_as_dict() -> dict:
    out: dict = {}
    for e in platform_field_matrix():
        kinds = {}
        for kind, fields in e["fields"].items():
            kinds[kind] = {
                "extra_fields": {f["field"] for f in fields},
                "required": {f["field"] for f in fields if f["required"]},
            }
        out[e["platform_code"]] = {"kinds": set(e["kinds"]), "by_kind": kinds}
    return out


def main() -> None:
    with open(DOC, encoding="utf-8") as f:
        md = f.read()
    doc = _extract_appendix_json(md).get("platforms", {})
    spec = _spec_as_dict()

    errors: list[str] = []

    # 平台集合
    if set(doc) != set(spec):
        only_doc = set(doc) - set(spec)
        only_spec = set(spec) - set(doc)
        if only_doc:
            errors.append(f"附录多出平台（spec 无）：{sorted(only_doc)}")
        if only_spec:
            errors.append(f"附录缺少平台（spec 有）：{sorted(only_spec)}")

    for code in sorted(set(doc) & set(spec)):
        d = doc[code]
        s = spec[code]
        d_kinds = set(d.get("kinds", []))
        if d_kinds != s["kinds"]:
            errors.append(f"[{code}] kinds 不一致：附录 {sorted(d_kinds)} vs spec {sorted(s['kinds'])}")
        d_extra = d.get("extra_fields", {})
        d_req = d.get("required", {})
        for kind, sk in s["by_kind"].items():
            de = set(d_extra.get(kind, []))
            if de != sk["extra_fields"]:
                errors.append(
                    f"[{code}·{kind}] extra_fields 不一致：附录 {sorted(de)} vs spec {sorted(sk['extra_fields'])}"
                )
            dr = set(d_req.get(kind, []))
            if dr != sk["required"]:
                errors.append(
                    f"[{code}·{kind}] required 不一致：附录 {sorted(dr)} vs spec {sorted(sk['required'])}"
                )

    if errors:
        print("[FAIL] 文档附录 与 publish_spec.py 存在 %d 处不一致：" % len(errors))
        for e in errors:
            print("  -", e)
        sys.exit(1)
    print("[OK] 文档附录 JSON 与 publish_spec.py 完全一致（%d 平台，0 mismatch）" % len(spec))


if __name__ == "__main__":
    main()
