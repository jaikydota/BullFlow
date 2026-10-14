# 推量发 (TuiLiangFa) 网关

多租户灵径网关：统一对接灵径 lapi.cc 的单一 appId，对外提供 SDK（Bearer app_key）+ 后台管理（JWT）+ webhook 收发。

## 接入方文档

- **[推量发开放接口文档](docs/推量发开放接口文档.md)** — 主文档（对外）：鉴权、账号绑定、一键发布、各平台 platform_code 与参数规格、**以 Webhook 为主获取结果**。AI 可直接读取此文档生成接入代码。
- **[推量发轮询接口补充文档](docs/推量发轮询接口补充文档.md)** — 补充件，**按需提供**给确实无法接收 Webhook 的接入方（授权/任务轮询查询接口 + 节流规范）。主文档默认引导用 Webhook，不展示轮询接口。

---

# 灵径官方接口文档：

## llm文档：
https://s.apifox.cn/8a6d9289-1490-4608-8e60-242e77d8442d/llms.txt

## web文档：
https://s.apifox.cn/8a6d9289-1490-4608-8e60-242e77d8442d/7713832m0