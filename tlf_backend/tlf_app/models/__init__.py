"""模型聚合导入（供 alembic autogenerate 发现 + 全局 Base.metadata）。"""
from __future__ import annotations

from tlf_app.models.base import Base, BaseMixin, UUIDBin16  # noqa: F401
from tlf_app.models.admin_user import AdminUser  # noqa: F401
from tlf_app.models.developer_app import DeveloperApp  # noqa: F401
from tlf_app.models.media_account import MediaAccount  # noqa: F401
from tlf_app.models.lapi_account import LapiAccount  # noqa: F401
from tlf_app.models.tenant_account_binding import TenantAccountBinding  # noqa: F401
from tlf_app.models.publish_task import PublishTask  # noqa: F401
from tlf_app.models.account_metric import AccountMetric  # noqa: F401
from tlf_app.models.proxy import Proxy  # noqa: F401
from tlf_app.models.webhook_event import WebhookEvent  # noqa: F401
from tlf_app.models.platform_policy import PlatformPolicy  # noqa: F401
