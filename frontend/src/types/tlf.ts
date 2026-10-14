export type TlfAccountStatus = 'active' | 'expired' | 'revoked'

export interface TlfAccount {
  id: string
  /** 推量发稳定账号 id（acc_xxx，对外不透明、永不变）。仅作标识透传，前端不解析其格式。 */
  tlf_account_id: string
  platform_code: string
  platform_user_id: string
  platform_user_name: string | null
  platform_avatar: string | null
  /** 主页 URL：能拼出用户主页则为用户主页，否则为平台站点首页（网关已兜底，前端直接用、不再自己兜底） */
  platform_home_url: string | null
  /** platform_home_url 是否为用户个人主页：true=用户主页 / false=平台站点首页（拼不出用户主页时的兜底） */
  home_url_is_profile: boolean | null
  status: TlfAccountStatus
  last_authed_at: string | null
  last_sync_at: string | null
  created_at: string
  updated_at: string
  /** 仅「同步」接口返回：本次登录态检测结论 active/expired/error（error=检测异常，status 未更新）。列表接口为 undefined。 */
  login_check?: 'active' | 'expired' | 'error' | null
}

/** 抖音发布风控状态 */
export interface RiskCheckMethod {
  /** password=登录密码 / smscode=短信验证码 */
  type: string
  name?: string
}
export interface RiskStatus {
  risk_status: boolean
  check_methods: RiskCheckMethod[]
}

export interface StartAuthorizationRequest {
  platform_code: string
  /** 社媒平台账号密码（DouYin 等平台云授权必填，用于云端代登录；本地不存） */
  password?: string
  /** 代理网络区域（来自 GET /tlf/proxy-regions，如「广东-深圳」）；不传则沿用上次/全局分配 */
  region?: string
}

/** 可选代理网络区域 + 当前用户上次选择（扫码绑定前选区域用） */
export interface TlfProxyRegionsResponse {
  regions: string[]
  /** 该用户上次选择的区域；未传/从未选/账号已清空 → null */
  last_selected_region: string | null
}

export interface StartAuthorizationResponse {
  operation_id: string
  qr_code: string | null
  scheme: string | null
  session_id: string | null
  /** 海外平台(Composio)OAuth 跳转链接；国内平台为 null（走二维码） */
  redirect_url: string | null
}

export type AuthOpStatus = 'pending' | 'scanned' | 'success' | 'failed'

export interface AuthOpStatusResponse {
  status: AuthOpStatus
  errorMessage?: string
  errorCode?: number
  platformCode?: string
  platformUserName?: string | null
  platformAvatar?: string | null
  accountId?: string
}

export type TlfTaskStatus =
  | 'pending'
  | 'publishing'
  | 'success'
  | 'partial'
  | 'failed'
  | 'cancelled'

export interface TlfAccountSnapshot {
  id: string
  tlfAccountId?: string
  subTaskId?: string
  platformUserId: string
  platformUserName: string | null
  platformAvatar: string | null
  /** 发布时快照的主页 URL（用户主页或平台首页，网关已兜底，直接用） */
  platformHomeUrl?: string | null
  /** platformHomeUrl 是否为用户个人主页：true=用户主页 / false=平台站点首页 */
  platformHomeUrlIsProfile?: boolean | null
}

export interface TlfProgressInfo {
  stage?: string             // upload / push
  stageStatus?: string       // doing / success / fail
  totalParts?: number
  uploadedParts?: number
  errorMessage?: string
}

export interface TlfAuditInfo {
  stage?: string             // transcoding / review / scheduled / success / notfound
  stageStatus?: string
  openUrl?: string
  openUrls?: { title?: string; cover?: string; documentId?: string; openUrl?: string }[]
  errorMessage?: string
}

export interface TlfResultItem {
  subTaskId?: string
  accountId?: string         // 本地 TlfAccount.id
  tlfAccountId?: string     // 云端账号 ID
  status: 'success' | 'failed' | 'publishing' | string
  publishId?: string
  workId?: string
  errorMessage?: string
  progress?: TlfProgressInfo
  audit?: TlfAuditInfo
  openUrl?: string
}

export interface TlfTask {
  id: string
  content_id: string | null
  content_snapshot: Record<string, unknown> | null
  tlf_operation_id: string | null
  platform_code: string
  target_account_ids: string[]
  account_snapshot: TlfAccountSnapshot[] | null
  status: TlfTaskStatus
  total_count: number
  success_count: number
  failed_count: number
  result_summary: TlfResultItem[] | null
  error_message: string | null
  /** 计划发布时间（毫秒级 Unix 时间戳）；NULL = 立即发布 */
  pre_pub_time: number | null
  created_at: string
  updated_at: string
}

export interface TlfPublishRequest {
  content_id?: string
  platform_code: string
  account_ids: string[]
  /** 发布类型：video / article / dynamic；后端默认 dynamic */
  publish_kind?: 'video' | 'article' | 'dynamic'
  title?: string
  body?: string
  /** 视频 URL（publish_kind=video 必填） */
  video_url?: string
  /** 封面图 URL（publish_kind=video/article 时使用） */
  cover_urls?: string[]
  /** 图片 URL（publish_kind=dynamic 时使用） */
  media_urls?: string[]
  /** 文章 HTML 正文（publish_kind=article 时使用） */
  html_content?: string
  /** 可见性（平台 enum，0/1/3 等） */
  visible_type?: number | string
  /** 创作申明（平台 enum，每平台值不同） */
  statement?: number | string
  /** 定时发布时间（毫秒级 Unix 时间戳；不填即立即发布） */
  pre_pub_time?: number
  /** 话题列表（用于 desc 内插入 #xxx#） */
  topics?: string[]
  /** 标签列表（B 站、CSDN 等需要） */
  tags?: string[]
  /** 地理位置（结构 free-form，先占位透传） */
  location?: Record<string, unknown>
  /** 创作类型 / 原创声明（B 站 / AcFun / 网易号文章 / 车家号文章；走 createType 字段） */
  create_type?: number
  /** 一级分类（部分平台发布必填，如哔哩哔哩视频）；提交所选分类节点对象 */
  category?: TlfCategoryNode
  /** 二级分类（所选一级分类含子类时） */
  sub_category?: TlfCategoryNode
  /** 海外平台特有发布参数（如 Reddit {subreddit}）；整体透传到网关 */
  extra?: Record<string, unknown>
}

/** /tlf/prefill 的截断/缺字段提示（与后端 build_publish_fields.warnings 同构） */
export interface TlfPrefillWarning {
  field: 'title' | 'desc' | 'content' | 'images' | 'covers' | 'video'
  originalSize: number
  truncatedTo: number
  message: string
}

/** /tlf/prefill 返回：按内容 + 平台预填的可编辑发布字段（article 的 body 为 markdown 原文） */
export interface TlfPrefillResult {
  title: string
  body: string
  images: string[]
  covers: string[]
  videoUrl: string | null
  tags: string[]
  warnings: TlfPrefillWarning[]
}

/** 内容分类树节点（来自获取分类接口；提交时整节点透传给上游 category/subCategory） */
export interface TlfCategoryNode {
  yixiaoerId: string
  yixiaoerName: string
  raw?: unknown
  child?: TlfCategoryNode[]
}

export interface TlfMetric {
  snapshot_date: string
  followers: number
  works_count: number
  total_likes: number
  total_views: number
  raw: Record<string, unknown> | null
  created_at: string
}
