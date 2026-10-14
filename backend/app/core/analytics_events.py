"""数据埋点事件名契约（前后端唯一权威来源）。

前端 `frontend/src/utils/tracking.ts` 的 EVENTS 常量需与本文件保持一致；
新增事件时两端同步。后端上报接口用 `ALLOWED_EVENTS` 校验，丢弃未知事件名。
"""
from __future__ import annotations

# —— 1. 访问与注册 ——
EVENT_PAGE_VIEW = "page_view"
EVENT_REGISTER_SUCCESS = "register_success"
EVENT_LOGIN_SUCCESS = "login_success"

# —— 2. 新用户激活 / 3. 创作流程 ——
EVENT_ENTER_CREATE_PAGE = "enter_create_page"   # 进入创作页
EVENT_CREATE_PROJECT = "create_project"          # 创建项目成功（本项目=新建对话会话）
EVENT_GENERATION_START = "generation_start"      # 生成开始
EVENT_GENERATION_SUCCESS = "generation_success"  # 生成成功
EVENT_GENERATION_FAILED = "generation_failed"    # 生成失败
EVENT_EXPORT_START = "export_start"              # 导出开始
EVENT_EXPORT_SUCCESS = "export_success"          # 导出成功
EVENT_EXPORT_FAILED = "export_failed"            # 导出失败

# —— 4. 付费流程 ——
EVENT_VIEW_PRICING = "view_pricing"        # 访问套餐页
EVENT_SELECT_PLAN = "select_plan"          # 选择套餐
EVENT_PAYMENT_START = "payment_start"      # 发起支付
EVENT_PAYMENT_SUCCESS = "payment_success"  # 支付成功
EVENT_PAYMENT_FAILED = "payment_failed"    # 支付失败

# —— 5. 升级引导 ——
EVENT_QUOTA_EXHAUSTED = "quota_exhausted"          # 免费额度耗尽
EVENT_UPGRADE_MODAL_SHOWN = "upgrade_modal_shown"  # 展示升级弹窗
EVENT_UPGRADE_CLICK = "upgrade_click"              # 点击升级按钮

ALLOWED_EVENTS: frozenset[str] = frozenset({
    EVENT_PAGE_VIEW, EVENT_REGISTER_SUCCESS, EVENT_LOGIN_SUCCESS,
    EVENT_ENTER_CREATE_PAGE, EVENT_CREATE_PROJECT,
    EVENT_GENERATION_START, EVENT_GENERATION_SUCCESS, EVENT_GENERATION_FAILED,
    EVENT_EXPORT_START, EVENT_EXPORT_SUCCESS, EVENT_EXPORT_FAILED,
    EVENT_VIEW_PRICING, EVENT_SELECT_PLAN,
    EVENT_PAYMENT_START, EVENT_PAYMENT_SUCCESS, EVENT_PAYMENT_FAILED,
    EVENT_QUOTA_EXHAUSTED, EVENT_UPGRADE_MODAL_SHOWN, EVENT_UPGRADE_CLICK,
})

# 主流程转化漏斗步骤（顺序即漏斗层级）；admin 漏斗接口按此逐步统计 distinct 用户
FUNNEL_STEPS: list[tuple[str, str]] = [
    (EVENT_PAGE_VIEW, "页面访问"),
    (EVENT_REGISTER_SUCCESS, "注册成功"),
    (EVENT_ENTER_CREATE_PAGE, "首次进入创作页"),
    (EVENT_CREATE_PROJECT, "首次创建项目"),
    (EVENT_GENERATION_SUCCESS, "首次生成成功"),
    (EVENT_EXPORT_SUCCESS, "首次导出成功"),
    (EVENT_VIEW_PRICING, "访问套餐页"),
    (EVENT_PAYMENT_START, "发起支付"),
    (EVENT_PAYMENT_SUCCESS, "支付成功"),
]
