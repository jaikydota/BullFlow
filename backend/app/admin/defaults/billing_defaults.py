"""Default billing wizard config (对齐 admin_frontend billing 页的 defaultConfig)。

模型清单对应 backend 已接入的供应商：
- text: Azure OpenAI (GPT-5.4 系列) + 火山方舟 (Doubao Seed 2.0) + 阿里云 (Qwen)
- image: 豆包 Seedream 5.0 + 腾讯 GEM (Nano Banana 2) + Azure GPT-Image-2
- video: 豆包 Seedance 2.0 + 腾讯 可灵 3.0
- audio: 自建 IndexTTS

**单位约定**：unitPrice 直接是 **积分**（不是元）。以下为默认积分单价，
可在管理后台计费配置中调整；文本模型按 input/output 加权的每 1K tokens 计。

积分计算公式：
- text: ceil(tokens / 1000 × unitPrice)
- image: ceil(unitPrice × pricingMatrix[size].multiplier)
- video: ceil(unitPrice × pricingMatrix[res].multiplier × duration_seconds)
- distribution: account_count × distribution
"""

from __future__ import annotations

# 图片规格倍率：key 必须与生成时实际传入的尺寸串完全一致才命中（见 SizeSelector.tsx 各 provider 选项），
# 否则回退 ×1。倍率按"像素面积 / 该 provider 最小尺寸面积"近似取整。

# 豆包 Seedream 5.0：三档尺寸像素面积相同（3,686,400），统一 1×
_DOUBAO_IMAGE_MATRIX = {
    "by": "size",
    "items": [
        {"key": "2560x1440", "label": "2560×1440 (16:9)", "multiplier": 1.0},
        {"key": "1440x2560", "label": "1440×2560 (9:16)", "multiplier": 1.0},
        {"key": "1920x1920", "label": "1920×1920 (1:1)", "multiplier": 1.0},
    ],
}

# 腾讯 GEM：以 1920×1080（2,073,600）为 1×；1920×1920 面积 1.78× → 取 1.8
_TENCENT_IMAGE_MATRIX = {
    "by": "size",
    "items": [
        {"key": "1920x1080", "label": "1920×1080 (16:9)", "multiplier": 1.0},
        {"key": "1080x1920", "label": "1080×1920 (9:16)", "multiplier": 1.0},
        {"key": "1920x1920", "label": "1920×1920 (1:1)", "multiplier": 1.8},
    ],
}

# Azure GPT-Image-2：以 1024×1024（1,048,576）为 1×，其余按面积比
_AZURE_IMAGE_MATRIX = {
    "by": "size",
    "items": [
        {"key": "1024x1024", "label": "1024×1024 (1:1)", "multiplier": 1.0},
        {"key": "1536x1024", "label": "1536×1024 (3:2)", "multiplier": 1.5},
        {"key": "1024x1536", "label": "1024×1536 (2:3)", "multiplier": 1.5},
        {"key": "2048x1152", "label": "2048×1152 (16:9·2K)", "multiplier": 2.25},
        {"key": "1152x2048", "label": "1152×2048 (9:16·2K)", "multiplier": 2.25},
        {"key": "2048x2048", "label": "2048×2048 (1:1·2K)", "multiplier": 4.0},
    ],
}

# 视频分辨率倍率：以 720p 为 1×；最终费用 = unitPrice × multiplier × duration_seconds
_VIDEO_RES_MATRIX = {
    "by": "resolution_duration",
    "items": [
        {"key": "720p", "label": "720P", "multiplier": 1.0},
        {"key": "1080p", "label": "1080P", "multiplier": 2.25},
        {"key": "2k", "label": "2K", "multiplier": 4.0},
        {"key": "4k", "label": "4K", "multiplier": 9.0},
    ],
}


BILLING_CONFIGURATION_DEFAULT: dict = {
    "models": [
        # ---- text（积分/1K tokens） ----
        {
            "id": "gpt-5.4-nano",
            "name": "GPT-5.4 Nano",
            "provider": "Azure OpenAI",
            "type": "text",
            "billingMode": "pay_as_you_go",
            "unitPrice": 0.066,
            "enabled": True,
        },
        {
            "id": "gpt-5.4-mini",
            "name": "GPT-5.4 Mini",
            "provider": "Azure OpenAI",
            "type": "text",
            "billingMode": "pay_as_you_go",
            "unitPrice": 0.24,
            "enabled": True,
        },
        {
            "id": "gpt-5.4",
            "name": "GPT-5.4",
            "provider": "Azure OpenAI",
            "type": "text",
            "billingMode": "pay_as_you_go",
            "unitPrice": 1.5,
            "enabled": False,
        },
        {
            "id": "doubao-seed-2-0-pro-260215",
            "name": "豆包 Seed 2.0 Pro",
            "provider": "火山方舟",
            "type": "text",
            "billingMode": "pay_as_you_go",
            "unitPrice": 0.12,
            "enabled": True,
        },
        {
            "id": "doubao-seed-2-0-lite-260215",
            "name": "豆包 Seed 2.0 Lite",
            "provider": "火山方舟",
            "type": "text",
            "billingMode": "pay_as_you_go",
            "unitPrice": 0.03,
            "enabled": True,
        },
        {
            "id": "doubao-seed-2-0-mini-260215",
            "name": "豆包 Seed 2.0 Mini",
            "provider": "火山方舟",
            "type": "text",
            "billingMode": "pay_as_you_go",
            "unitPrice": 0.015,
            "enabled": True,
        },
        {
            "id": "qwen3.6-flash",
            "name": "通义千问 3.6 Flash",
            "provider": "阿里云",
            "type": "text",
            "billingMode": "pay_as_you_go",
            "unitPrice": 0.01,
            "enabled": True,
        },
        {
            "id": "qwen3.7-plus",
            "name": "通义千问 3.7 Plus",
            "provider": "阿里云",
            "type": "text",
            "billingMode": "pay_as_you_go",
            "unitPrice": 0.036,
            "enabled": True,
        },
        {
            "id": "qwen3.7-max",
            "name": "通义千问 3.7 Max",
            "provider": "阿里云",
            "type": "text",
            "billingMode": "pay_as_you_go",
            "unitPrice": 0.06,
            "enabled": True,
        },
        # ---- image（积分/张，1024² 基准） ----
        {
            "id": "doubao-seedream-5-0-260128",
            "name": "豆包 Seedream 5.0",
            "provider": "火山方舟",
            "type": "image",
            "billingMode": "fixed",
            "unitPrice": 2.5,
            "pricingMatrix": _DOUBAO_IMAGE_MATRIX,
            "enabled": True,
        },
        {
            "id": "tencent-gem",
            "name": "腾讯 GEM (Nano Banana 2)",
            "provider": "腾讯智能创作",
            "type": "image",
            "billingMode": "fixed",
            "unitPrice": 9.5,
            "pricingMatrix": _TENCENT_IMAGE_MATRIX,
            "enabled": True,
        },
        {
            # 与 backend settings.AZURE_IMAGE_MODEL + _resolve_image_model_id('azure') 保持一致
            "id": "gpt-image-2",
            "name": "GPT-Image-2",
            "provider": "Azure OpenAI",
            "type": "image",
            "billingMode": "fixed",
            "unitPrice": 3.5,
            "pricingMatrix": _AZURE_IMAGE_MATRIX,
            "enabled": True,
        },
        # ---- video（积分/秒，720p 基准） ----
        {
            "id": "doubao-seedance-2-0-260128",
            "name": "豆包 Seedance 2.0",
            "provider": "火山方舟",
            "type": "video",
            "billingMode": "fixed",
            "unitPrice": 10.0,
            "pricingMatrix": _VIDEO_RES_MATRIX,
            "enabled": True,
        },
        {
            "id": "tencent-kling-3-0",
            "name": "腾讯 可灵 3.0",
            "provider": "腾讯智能创作",
            "type": "video",
            "billingMode": "fixed",
            "unitPrice": 4.8,
            "pricingMatrix": _VIDEO_RES_MATRIX,
            "enabled": True,
        },
        # ---- audio（积分/次） ----
        {
            "id": "index-tts",
            "name": "IndexTTS（自托管）",
            "provider": "自建",
            "type": "audio",
            "billingMode": "fixed",
            "unitPrice": 0.0,
            "enabled": True,
        },
    ],
    "distribution": 1,
    "robot": {"modelId": "doubao-seed-2-0-mini-260215", "unitPrice": 0.015},
}
