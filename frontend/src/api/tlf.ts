import api from './index'
import type {
  AuthOpStatusResponse,
  TlfAccount,
  TlfCategoryNode,
  TlfPrefillResult,
  TlfPublishRequest,
  TlfTask,
  RiskStatus,
  StartAuthorizationRequest,
  StartAuthorizationResponse,
  TlfProxyRegionsResponse,
} from '@/types/tlf'

interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export const tlfApi = {
  // 账号
  listAccounts: (params?: { platform_code?: string; status?: string }) =>
    api.get<any, TlfAccount[]>('/tlf/accounts', { params }),

  startAuthorization: (data: StartAuthorizationRequest) =>
    api.post<any, StartAuthorizationResponse>('/tlf/accounts/authorize', data),

  /** 扫码绑定前取可选代理网络区域 + 当前用户上次选择 */
  getProxyRegions: () =>
    api.get<any, TlfProxyRegionsResponse>('/tlf/proxy-regions'),

  syncAccount: (id: string) =>
    api.post<any, TlfAccount>(`/tlf/accounts/${id}/sync`),

  /** 批量同步/检查账号登录态（分批调用，单批 ≤ 网关上限）；返回更新后的账号数组(带 login_check) */
  syncAccountsBatch: (accountIds: string[]) =>
    api.post<any, TlfAccount[]>('/tlf/accounts/sync-batch', { account_ids: accountIds }),

  /** 主动同步：拉远端账号列表，返回新入库的账号（webhook 不可达时兜底） */
  probeAccounts: (params?: { platform_code?: string }) =>
    api.post<any, TlfAccount[]>('/tlf/accounts/probe', undefined, { params }),

  /** 查询授权 operationId 的最新状态（pending / scanned / success / failed） */
  getAuthStatus: (operationId: string) =>
    api.get<any, AuthOpStatusResponse>(`/tlf/accounts/auth-status/${operationId}`),

  revokeAccount: (id: string) =>
    api.delete<any, void>(`/tlf/accounts/${id}`),

  /** 获取账号某发布类型的内容分类树（部分平台发布必填，如哔哩哔哩视频） */
  getCategories: (accountId: string, publishKind: string) =>
    api.get<any, TlfCategoryNode[]>(`/tlf/accounts/${accountId}/categories`, {
      params: { publish_kind: publishKind },
    }),

  /** 按内容 + 平台预填发布表单（与自动分发共用后端统一映射 build_publish_fields） */
  prefill: (data: { content_id: string; platform_codes: string[]; kind: string }) =>
    api.post<any, TlfPrefillResult>('/tlf/prefill', data),

  // 发布
  publish: (data: TlfPublishRequest) =>
    api.post<any, TlfTask>('/tlf/publish', data),

  listTasks: (params?: { page?: number; page_size?: number; status?: string; platform_code?: string }) =>
    api.get<any, Paginated<TlfTask>>('/tlf/tasks', { params }),

  getTask: (id: string) => api.get<any, TlfTask>(`/tlf/tasks/${id}`),

  cancelTask: (id: string) =>
    api.post<any, void>(`/tlf/tasks/${id}/cancel`),

  deleteTask: (id: string) =>
    api.delete<any, void>(`/tlf/tasks/${id}`),

  // 抖音发布风控解除
  getRiskStatus: (id: string) =>
    api.get<any, RiskStatus>(`/tlf/accounts/${id}/risk-status`),
  sendRiskSms: (id: string) =>
    api.post<any, { mobile?: string }>(`/tlf/accounts/${id}/risk-sms`),
  confirmRisk: (id: string, body: { method: 'password' | 'smscode'; password?: string; code?: string }) =>
    api.post<any, { mobile?: string }>(`/tlf/accounts/${id}/risk-confirm`, body),
}
