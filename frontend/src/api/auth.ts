import api from './index'
import type {
  ChangePasswordRequest,
  ChangePhoneRequest,
  LoginRequest,
  PhoneLoginRequest,
  RefreshRequest,
  RegisterRequest,
  ResetPasswordRequest,
  SendSmsCodeRequest,
  SendSmsCodeResponse,
  SmsLoginRequest,
  TokenResponse,
} from '@/types/auth'
import type { User, UserUpdate } from '@/types/user'

export const authApi = {
  // 邮箱密码
  login: (data: LoginRequest) =>
    api.post<any, TokenResponse>('/auth/login', data),

  // 手机号 + 密码
  loginByPhonePassword: (data: PhoneLoginRequest) =>
    api.post<any, TokenResponse>('/auth/login-by-phone-password', data),

  // 手机号 + 验证码（免密）；未注册手机号将自动注册，registered=true 表示本次是新注册
  loginBySms: (data: SmsLoginRequest) =>
    api.post<any, TokenResponse & { registered?: boolean }>('/auth/login-by-sms', data),

  // 注册
  register: (data: RegisterRequest) =>
    api.post<any, TokenResponse>('/auth/register', data),

  // 发送验证码
  sendSmsCode: (data: SendSmsCodeRequest) =>
    api.post<any, SendSmsCodeResponse>('/auth/send-sms-code', data),

  // 重置密码
  resetPassword: (data: ResetPasswordRequest) =>
    api.post<any, { user_id: string }>('/auth/reset-password', data),

  // 其它
  refresh: (data: RefreshRequest) => api.post<any, TokenResponse>('/auth/refresh', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get<any, User>('/auth/me'),
  updateMe: (data: UserUpdate) => api.put<any, User>('/auth/me', data),

  // 修改 / 绑定手机号
  changePhone: (data: ChangePhoneRequest) => api.put<any, User>('/auth/me/phone', data),

  // 设置 / 修改登录密码（已登录）
  changePassword: (data: ChangePasswordRequest) =>
    api.post<any, User>('/auth/change-password', data),
}
