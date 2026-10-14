"""media_accounts 加 home_url_is_profile（platform_home_url 是用户主页还是平台首页）

Revision ID: 0014_home_url_is_profile
Revises: 0013_widen_avatar
Create Date: 2026-07-02 10:00:00.000000

platform_home_url 兜底收敛到网关：拼不出用户主页时退平台站点首页。新增 home_url_is_profile 标记
该 URL 是用户个人主页(True)还是平台站点首页(False)，供下游直接展示，无需自己兜底。
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014_home_url_is_profile"
down_revision: Union[str, Sequence[str], None] = "0013_widen_avatar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 与 services/author_home_url._SITE_HOME 对齐（存量回填用；勿漏平台）
_SITE_HOME = {
    "DouYin": "https://www.douyin.com", "KuaiShou": "https://www.kuaishou.com",
    "XiaoHongShu": "https://www.xiaohongshu.com", "XiaoHongShuShangJiaHao": "https://www.xiaohongshu.com",
    "BiLiBiLi": "https://www.bilibili.com", "BiliBiliComic": "https://manga.bilibili.com",
    "BaiJiaHao": "https://baijiahao.baidu.com", "TouTiaoHao": "https://mp.toutiao.com",
    "XinLangWeiBo": "https://weibo.com", "ShiPinHao": "https://channels.weixin.qq.com",
    "ZhiHu": "https://www.zhihu.com", "WeiXinGongZhongHao": "https://mp.weixin.qq.com",
    "XueQiuHao": "https://xueqiu.com", "KuaiChuanHao": "https://kuaichuan.uc.cn",
    "ACFun": "https://www.acfun.cn", "YiCheHao": "https://www.yiche.com",
    "DuoDuoShiPin": "https://www.pinduoduo.com", "MeiPai": "https://www.meipai.com",
    "AiQiYi": "https://www.iqiyi.com", "SouHuShiPin": "https://tv.sohu.com",
    "TengXunWeiShi": "https://weishi.qq.com", "DouBan": "https://www.douban.com",
    "JianShu": "https://www.jianshu.com", "LinkedIn": "https://www.linkedin.com",
    "Facebook": "https://www.facebook.com", "Instagram": "https://www.instagram.com",
    "Reddit": "https://www.reddit.com", "YouTube": "https://www.youtube.com",
    "Twitter": "https://x.com", "TikTok": "https://www.tiktok.com",
}


def upgrade() -> None:
    op.add_column(
        "media_accounts",
        sa.Column("home_url_is_profile", sa.Boolean(), nullable=True,
                  comment="platform_home_url 是否为用户个人主页：True=用户主页 / False=平台站点首页"),
    )
    conn = op.get_bind()
    # ① 存量非空 home_url 视为用户主页
    conn.execute(sa.text(
        "UPDATE media_accounts SET home_url_is_profile = true WHERE platform_home_url IS NOT NULL"
    ))
    # ② 快手历史存的是错误的数字 profile URL（灵径拿不到 eid）→ 统一改成快手站点首页
    conn.execute(sa.text(
        "UPDATE media_accounts SET platform_home_url = :u, home_url_is_profile = false "
        "WHERE platform_code = 'KuaiShou'"
    ), {"u": _SITE_HOME["KuaiShou"]})
    # ③ 空 home_url 的按平台补站点首页（避免下游去掉兜底后这些账号丢失「前往平台」入口）
    for code, url in _SITE_HOME.items():
        conn.execute(sa.text(
            "UPDATE media_accounts SET platform_home_url = :u, home_url_is_profile = false "
            "WHERE platform_code = :c AND platform_home_url IS NULL"
        ), {"u": url, "c": code})


def downgrade() -> None:
    op.drop_column("media_accounts", "home_url_is_profile")
