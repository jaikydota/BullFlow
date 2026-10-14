import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/common/Toast'
import { AuthLayout } from '@/pages/auth/AuthLayout'
import { CnPhoneInput, cnPhoneToE164, isCnPhoneValid } from '@/components/auth/CnPhoneInput'
import { SmsCodeInput } from '@/components/auth/SmsCodeInput'
import { authApi } from '@/api/auth'
import { requestCaptcha } from '@/stores/captchaStore'
import { ApiError } from '@/types/api'

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,20}$/

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)

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
      await authApi.sendSmsCode({ phone: cnPhoneToE164(phone), purpose: 'reset_password', captcha_ticket: ticket })
      toast.success(t('auth.codeSent'))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('auth.codeFailed'))
      throw err
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneValid) {
      toast.error(t('auth.phoneInvalid'))
      return
    }
    if (!PASSWORD_RE.test(newPassword)) {
      toast.error(t('auth.passwordWeak'))
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword({
        phone: cnPhoneToE164(phone),
        code,
        new_password: newPassword,
      })
      toast.success(t('auth.resetSuccess'))
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={t('auth.resetPasswordTitle')}
      subtitle={t('auth.resetPasswordSubtitle')}
      footer={
        <div className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t('auth.backToLogin')}
          </Link>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <div className="space-y-1.5">
          <Label htmlFor="reset-phone">{t('auth.phone')}</Label>
          <CnPhoneInput id="reset-phone" value={phone} onChange={setPhone} autoFocus required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reset-code">{t('auth.smsCode')}</Label>
          <SmsCodeInput
            id="reset-code"
            value={code}
            onChange={setCode}
            onSend={handleSendCode}
            canSend={phoneValid}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reset-password">{t('auth.newPassword')}</Label>
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <p className="text-xs text-muted-foreground">{t('auth.passwordRule')}</p>
        </div>

        <Button type="submit" size="lg" disabled={loading} className="w-full cursor-pointer">
          {loading ? t('auth.resetting') : t('auth.resetPassword')}
        </Button>
      </form>
    </AuthLayout>
  )
}
