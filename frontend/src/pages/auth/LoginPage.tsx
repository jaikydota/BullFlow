import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/common/Toast'
import { AuthLayout } from '@/pages/auth/AuthLayout'
import { AgreementCheckbox } from '@/components/auth/AgreementCheckbox'
import { useAgreementConsent } from '@/components/auth/useAgreementConsent'
import { CnPhoneInput, cnPhoneToE164, isCnPhoneValid } from '@/components/auth/CnPhoneInput'
import { SmsCodeInput } from '@/components/auth/SmsCodeInput'
import { useAuthStore } from '@/stores/authStore'
import { requestCaptcha } from '@/stores/captchaStore'
import { authApi } from '@/api/auth'
import { identifyAccount } from '@/utils/accountIdentifier'
import { storage } from '@/utils/storage'
import { ApiError } from '@/types/api'
import { trackEvent, EVENTS } from '@/utils/tracking'

const REMEMBER_KEY = 'remember_me'
const ACCOUNT_KEY = 'login_account'

type Tab = 'password' | 'sms'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const loginByPhonePassword = useAuthStore((s) => s.loginByPhonePassword)
  const loginBySms = useAuthStore((s) => s.loginBySms)

  const [tab, setTab] = useState<Tab>('password')
  const [agreed, setAgreed] = useAgreementConsent()

  // 账号密码（自动识别邮箱 / 手机号）
  const [account, setAccount] = useState(() => storage.get<string>(ACCOUNT_KEY) ?? '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(() => Boolean(storage.get<boolean>(REMEMBER_KEY)))

  // 手机验证码（+86 only）
  const [smsPhone, setSmsPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  // 销售引流邀请码：从链接捕获存入 localStorage 的码（短信登录即注册时生效）
  const [storedInvitation] = useState<string | null>(() => storage.get<string>('invitation_code'))

  const [loading, setLoading] = useState(false)

  const onAfterLogin = () => {
    trackEvent(EVENTS.LOGIN_SUCCESS)
    toast.success(t('auth.loginSuccess'))
    navigate('/chat', { replace: true })
  }

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreed) {
      toast.error(t('auth.agreementRequired'))
      return
    }
    const kind = identifyAccount(account)
    if (kind === 'invalid') {
      toast.error(t('auth.accountInvalid'))
      return
    }
    const doLogin = (ticket?: string) =>
      kind === 'email'
        ? login(account.trim(), password, ticket)
        : loginByPhonePassword(cnPhoneToE164(account.trim()), password, ticket)

    setLoading(true)
    try {
      try {
        await doLogin()
      } catch (err) {
        // 连续失败后后端要求人机验证（42901）：弹滑块后带 ticket 重试一次
        if (err instanceof ApiError && err.code === 42901) {
          let ticket: string
          try {
            ticket = await requestCaptcha()
          } catch {
            return // 用户取消验证，静默中止
          }
          await doLogin(ticket)
        } else {
          throw err
        }
      }
      if (remember) {
        storage.set(ACCOUNT_KEY, account.trim())
        storage.set(REMEMBER_KEY, true)
      } else {
        storage.remove(ACCOUNT_KEY)
        storage.remove(REMEMBER_KEY)
      }
      onAfterLogin()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('auth.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleSendCode = async () => {
    if (!isCnPhoneValid(smsPhone)) {
      toast.error(t('auth.phoneInvalid'))
      throw new Error('invalid phone')
    }
    let ticket: string
    try {
      ticket = await requestCaptcha()
    } catch {
      throw new Error('captcha cancelled') // 用户取消，静默
    }
    try {
      await authApi.sendSmsCode({ phone: cnPhoneToE164(smsPhone), purpose: 'login', captcha_ticket: ticket })
      toast.success(t('auth.codeSent'))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('auth.codeFailed'))
      throw err
    }
  }

  const handleSmsLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreed) {
      toast.error(t('auth.agreementRequired'))
      return
    }
    if (!isCnPhoneValid(smsPhone)) {
      toast.error(t('auth.phoneInvalid'))
      return
    }
    setLoading(true)
    try {
      const registered = await loginBySms(
        cnPhoneToE164(smsPhone),
        smsCode,
        storedInvitation ?? undefined,
      )
      if (registered) {
        // 未注册手机号已自动注册；清掉一次性邀请码并提示
        storage.remove('invitation_code')
        toast.success(t('auth.autoRegistered', '该手机号未注册，已为你自动注册并登录'))
      } else {
        toast.success(t('auth.loginSuccess'))
      }
      navigate('/chat', { replace: true })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('auth.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={t('auth.login')}
      subtitle={t('auth.signInSubtitle')}
      footer={
        <div className="text-center text-sm text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            {t('auth.signUp')}
          </Link>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full">
        <TabsList className="mb-5 grid w-full grid-cols-2">
          <TabsTrigger value="password" className="cursor-pointer">
            {t('auth.loginWithPassword')}
          </TabsTrigger>
          <TabsTrigger value="sms" className="cursor-pointer">
            {t('auth.loginWithSms')}
          </TabsTrigger>
        </TabsList>

        {/* 账号 + 密码（自动识别邮箱 / 手机号） */}
        <TabsContent value="password">
          <form className="space-y-5" onSubmit={(e) => void handlePasswordLogin(e)}>
            <div className="space-y-1.5">
              <Label htmlFor="login-account">{t('auth.email')} / {t('auth.phone')}</Label>
              <Input
                id="login-account"
                type="text"
                name="account"
                autoComplete="username"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder={t('auth.accountPlaceholder')}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">{t('auth.password')}</Label>
              <Input
                id="login-password"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                />
                {t('auth.rememberMe')}
              </label>
              <Link to="/forgot-password" className="text-primary hover:underline">
                {t('auth.forgotPassword')}
              </Link>
            </div>
            <AgreementCheckbox checked={agreed} onCheckedChange={setAgreed} action="login" />
            <Button type="submit" size="lg" disabled={loading} className="w-full cursor-pointer">
              {loading ? t('auth.loggingIn') : t('auth.login')}
            </Button>
          </form>
        </TabsContent>

        {/* 手机号 + 验证码（+86 only） */}
        <TabsContent value="sms">
          <form className="space-y-5" onSubmit={(e) => void handleSmsLogin(e)}>
            <div className="space-y-1.5">
              <Label htmlFor="login-sms-phone">{t('auth.phone')}</Label>
              <CnPhoneInput id="login-sms-phone" value={smsPhone} onChange={setSmsPhone} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-sms-code">{t('auth.smsCode')}</Label>
              <SmsCodeInput
                id="login-sms-code"
                value={smsCode}
                onChange={setSmsCode}
                onSend={handleSendCode}
                canSend={isCnPhoneValid(smsPhone)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('auth.smsLoginAutoRegister', '未注册的手机号将自动注册并登录')}
            </p>
            <AgreementCheckbox checked={agreed} onCheckedChange={setAgreed} action="login" />
            <Button type="submit" size="lg" disabled={loading} className="w-full cursor-pointer">
              {loading ? t('auth.loggingIn') : t('auth.login')}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </AuthLayout>
  )
}
