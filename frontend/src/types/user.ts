export type UserRole = 'super_admin' | 'admin' | 'user'
export type UserStatus = 'active' | 'disabled'

export interface User {
  id: string
  email: string
  phone?: string | null
  nickname: string
  avatar: string | null
  role: UserRole
  status: UserStatus
  language: string
  /** 是否已设置登录密码（手机号注册用户初始为 false） */
  has_password?: boolean
  created_at: string
  updated_at: string
}

export interface UserUpdate {
  nickname?: string
  avatar?: string
  role?: UserRole
  status?: UserStatus
  language?: string
}
