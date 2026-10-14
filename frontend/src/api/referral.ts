import api from './index'

export interface ReferralReward {
  name: string
  points: number
}

export interface ReferralOverview {
  invitation_code: string
  register_reward: ReferralReward | null
  recharge_reward: ReferralReward | null
  stats: { invited_count: number; rewarded_count: number }
}

export interface ReferralListItem {
  id: string
  nickname: string | null
  identity: string | null
  created_at: string | null
  register_granted: boolean
  register_points: number | null
  recharge_granted: boolean
  recharge_points: number | null
}

export interface ReferralListResult {
  items: ReferralListItem[]
  total: number
  page: number
  page_size: number
  pages: number
}

export const referralApi = {
  /** 当前用户的邀请码 + 一阶/二阶奖励说明 + 统计 */
  getMe: (): Promise<ReferralOverview> => api.get<unknown, ReferralOverview>('/referral/me'),

  /** 我邀请的用户列表（仅已注册者） */
  list: (page = 1, pageSize = 20): Promise<ReferralListResult> =>
    api.get<unknown, ReferralListResult>('/referral/list', {
      params: { page, page_size: pageSize },
    }),
}
