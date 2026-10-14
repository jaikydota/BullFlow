export interface LoginRequest {
  email: string
  password: string
  captcha_ticket?: string
}

export interface PhoneLoginRequest {
  phone: string
  password: string
  captcha_ticket?: string
}

export interface SmsLoginRequest {
  phone: string
  code: string
  invitation_code?: string | null
}

export interface RegisterRequest {
  phone: string
  code: string
  invitation_code?: string | null
}

export interface ResetPasswordRequest {
  phone: string
  code: string
  new_password: string
}

export type SmsCodePurpose = 'register' | 'login' | 'reset_password' | 'change_phone'

export interface ChangePhoneRequest {
  phone: string
  code: string
}

export interface ChangePasswordRequest {
  new_password: string
  /** 已设密码时必填：校验旧密码 */
  current_password?: string
  /** 未设密码时必填：发送到本人手机号的短信验证码 */
  code?: string
}

export interface SendSmsCodeRequest {
  phone: string
  purpose: SmsCodePurpose
  captcha_ticket?: string
}

export interface SendSmsCodeResponse {
  ttl: number
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: UserBrief
}

export interface UserBrief {
  id: string
  email: string
  phone?: string | null
  nickname: string
  avatar?: string | null
  role: string
  has_password?: boolean
}

export interface RefreshRequest {
  refresh_token: string
}
