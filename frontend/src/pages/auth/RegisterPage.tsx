import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/common/Toast'
import { storage } from '@/utils/storage'
import { AuthLayout } from '@/pages/auth/AuthLayout'
import { AgreementCheckbox } from '@/components/auth/AgreementCheckbox'
import { useAgreementConsent } from '@/components/auth/useAgreementConsent'
import { CnPhoneInput, cnPhoneToE164, isCnPhoneValid } from '@/components/auth/CnPhoneInput'
import { SmsCodeInput } from '@/components/auth/SmsCodeInput'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { requestCaptcha } from '@/stores/captchaStore'
import { ApiError } from '@/types/api'
import { trackEvent, EVENTS } from '@/utils/tracking'

export default function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)

  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [agreed, setAgreed] = useAgreementConsent()
  const [loading, setLoading] = useState(false)
  // 销售引流邀请码：从链接捕获存入 localStorage 的码（有则默认绑定、不展示输入）
  const [storedInvitation] = useState<string | null>(() => storage.get<string>('invitation_code'))
  const [showCodeInput, setShowCodeInput] = useState(false)
  const [manualCode, setManualCode] = useState('')

  const phoneValid = isCnPhoneValid(phone)

  const handleSendCode = async () => {
    if (!phoneValid) {
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
      await authApi.sendSmsCode({ phone: cnPhoneToE164(phone), purpose: 'register', captcha_ticket: ticket })
      toast.success(t('auth.codeSent'))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('auth.codeFailed'))
      throw err
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreed) {
      toast.error(t('auth.agreementRequired'))
      return
    }
    if (!phoneValid) {
      toast.error(t('auth.phoneInvalid'))
      return
    }
    setLoading(true)
    try {
      const invitationCode = storedInvitation ?? (manualCode.trim() || undefined)
      await register(cnPhoneToE164(phone), code, invitationCode)
      storage.remove('invitation_code')
      trackEvent(EVENTS.REGISTER_SUCCESS)
      toast.success(t('auth.registerSuccess'))
      navigate('/chat', { replace: true })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('auth.registerFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <div className="text-center text-sm text-muted-foreground">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t('auth.signIn')}
          </Link>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <div className="space-y-1.5">
          <Label htmlFor="register-phone">{t('auth.phone')}</Label>
          <CnPhoneInput
            id="register-phone"
            value={phone}
            onChange={setPhone}
            autoFocus
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="register-code">{t('auth.smsCode')}</Label>
          <SmsCodeInput
            id="register-code"
            value={code}
            onChange={setCode}
            onSend={handleSendCode}
            canSend={phoneValid}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {t('auth.registerPhoneOnlyHint', '注册后可在「个人资料」设置昵称和登录密码')}
        </p>

        {/* 邀请码：链接已带则默认绑定不展示输入；否则提供可选的折叠输入 */}
        {storedInvitation ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            {t('auth.invitationBound', '已通过邀请链接绑定专属顾问')}
          </p>
        ) : showCodeInput ? (
          <div className="space-y-1.5">
            <Label htmlFor="register-invitation">
              {t('auth.invitationCode', '邀请码')}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {t('auth.optional', '（可选）')}
              </span>
            </Label>
            <Input
              id="register-invitation"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder={t('auth.invitationCodePlaceholder', '如有邀请码请输入')}
              autoComplete="off"
              className="font-mono"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCodeInput(true)}
            className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
          >
            {t('auth.haveInvitation', '有邀请码？点此填写（可选）')}
          </button>
        )}

        <AgreementCheckbox checked={agreed} onCheckedChange={setAgreed} action="register" />

        <Button type="submit" size="lg" disabled={loading} className="w-full cursor-pointer">
          {loading ? t('auth.registering') : t('auth.register')}
        </Button>
      </form>
    </AuthLayout>
  )
}
