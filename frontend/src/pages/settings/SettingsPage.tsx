import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Settings, User, Shield, Mail, Phone, Calendar } from 'lucide-react'
import { Avatar } from '@/components/common/Avatar'
import { Button } from '@/components/common/Button'
import { Input } from '@/components/common/Input'
import { toast } from '@/components/common/Toast'
import { PageContainer, PageHeader } from '@/components/shared'
import { Label } from '@/components/ui/label'
import { CnPhoneInput, cnPhoneToE164, isCnPhoneValid } from '@/components/auth/CnPhoneInput'
import { SmsCodeInput } from '@/components/auth/SmsCodeInput'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { requestCaptcha } from '@/stores/captchaStore'
import { isValidPassword } from '@/utils/validators'
import { isPlaceholderEmail, formatPhone } from '@/utils/helpers'
import { ApiError } from '@/types/api'
import { formatDate } from '@/utils/format'

export default function SettingsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const updateProfile = useAuthStore((s) => s.updateProfile)

  const [nickname, setNickname] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdCode, setPwdCode] = useState('') // 未设密码时用手机号验证码设置
  const [passwordLoading, setPasswordLoading] = useState(false)

  // 手机号修改
  const [newPhone, setNewPhone] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneLoading, setPhoneLoading] = useState(false)

  useEffect(() => {
    if (user) {
      setNickname(user.nickname ?? '')
    }
  }, [user])

  const hasRealEmail = !!user?.email && !isPlaceholderEmail(user.email)
  const hasPhone = !!user?.phone
  const hasPassword = !!user?.has_password

  const saveProfile = async () => {
    setProfileLoading(true)
    try {
      await updateProfile({
        nickname: nickname.trim() || undefined,
      })
      toast.success(t('common.success'))
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
    } finally {
      setProfileLoading(false)
    }
  }

  // 未设密码的用户：把验证码发送到本人当前手机号（沿用 reset_password 用途）
  const sendPwdCode = async () => {
    if (!user?.phone) {
      toast.error(t('settings.bindPhoneFirst', '请先绑定手机号后再设置密码'))
      throw new Error('no phone')
    }
    let ticket: string
    try {
      ticket = await requestCaptcha()
    } catch {
      throw new Error('captcha cancelled') // 用户取消，静默
    }
    try {
      await authApi.sendSmsCode({ phone: user.phone, purpose: 'reset_password', captcha_ticket: ticket })
      toast.success(t('auth.codeSent'))
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
      throw e
    }
  }

  const savePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error(t('settings.fillNewPassword'))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('settings.passwordMismatch'))
      return
    }
    if (!isValidPassword(newPassword)) {
      toast.error(t('settings.passwordTooShort'))
      return
    }
    if (hasPhone) {
      if (!/^\d{6}$/.test(pwdCode)) {
        toast.error(t('settings.invalidCode', '请输入 6 位验证码'))
        return
      }
    } else {
      if (!currentPassword.trim()) {
        toast.error(t('settings.enterCurrentPassword'))
        return
      }
    }
    setPasswordLoading(true)
    try {
      const updated = await authApi.changePassword(
        hasPhone
          ? { new_password: newPassword, code: pwdCode }
          : { new_password: newPassword, current_password: currentPassword },
      )
      setUser(updated)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPwdCode('')
      toast.success(t('common.success'))
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
    } finally {
      setPasswordLoading(false)
    }
  }

  const sendPhoneCode = async () => {
    if (!isCnPhoneValid(newPhone)) {
      toast.error(t('settings.invalidPhone', '请输入正确的 11 位手机号'))
      throw new Error('invalid')
    }
    if (user?.phone === cnPhoneToE164(newPhone)) {
      toast.error(t('settings.samePhone', '新手机号与当前手机号相同'))
      throw new Error('same')
    }
    let ticket: string
    try {
      ticket = await requestCaptcha()
    } catch {
      throw new Error('captcha cancelled') // 用户取消，静默
    }
    try {
      await authApi.sendSmsCode({
        phone: cnPhoneToE164(newPhone),
        purpose: 'change_phone',
        captcha_ticket: ticket,
      })
      toast.success(t('auth.codeSent'))
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
      throw e
    }
  }

  const savePhone = async () => {
    if (!isCnPhoneValid(newPhone)) {
      toast.error(t('settings.invalidPhone', '请输入正确的 11 位手机号'))
      return
    }
    if (!/^\d{6}$/.test(phoneCode)) {
      toast.error(t('settings.invalidCode', '请输入 6 位验证码'))
      return
    }
    setPhoneLoading(true)
    try {
      const updated = await authApi.changePhone({
        phone: cnPhoneToE164(newPhone),
        code: phoneCode,
      })
      setUser(updated)
      setNewPhone('')
      setPhoneCode('')
      toast.success(t('settings.phoneUpdated', '手机号已更新'))
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('common.failed')
      toast.error(msg)
    } finally {
      setPhoneLoading(false)
    }
  }

  const displayName = nickname.trim() || (hasRealEmail ? user!.email : '') || ''
  const identifier = hasRealEmail
    ? user!.email
    : hasPhone
      ? formatPhone(user!.phone)
      : t('user.unbound', '未绑定')

  return (
    <PageContainer size="md">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.subtitle')}
        icon={Settings}
        iconAccent="primary"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Card - Left Column */}
        <motion.div
          className="lg:col-span-1"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
        >
          <div className="card-elevated p-6 text-center">
            <div className="relative inline-block">
              <Avatar
                src={user?.avatar ?? undefined}
                name={displayName}
                size="xl"
                className="mx-auto"
              />
              <div className="absolute -bottom-1 -right-1 size-4 rounded-full bg-emerald-500 border-2 border-card" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground truncate">{displayName}</h3>
            <p className="text-sm text-muted-foreground truncate">{identifier}</p>

            <div className="mt-6 space-y-3 text-left">
              {/* 邮箱 —— 占位邮箱不显示 */}
              {hasRealEmail && (
                <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
                  <Mail className="size-4 text-muted-foreground/70 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground/70">{t('user.email')}</p>
                    <p className="text-sm text-foreground/80 truncate">{user!.email}</p>
                  </div>
                </div>
              )}
              {/* 手机号 */}
              <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
                <Phone className="size-4 text-muted-foreground/70 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground/70">{t('user.phone', '手机号')}</p>
                  <p className="text-sm text-foreground/80 truncate">
                    {hasPhone ? formatPhone(user!.phone) : t('user.unbound', '未绑定')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
                <User className="size-4 text-muted-foreground/70 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground/70">{t('user.role')}</p>
                  <p className="text-sm text-foreground/80">{user?.role || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
                <Calendar className="size-4 text-muted-foreground/70 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground/70">{t('user.createdAt')}</p>
                  <p className="text-sm text-foreground/80">{user?.created_at ? formatDate(user.created_at) : '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right Column - Edit Sections */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Edit Section */}
          <motion.section
            className="card-elevated p-6 sm:p-8"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: 0.1 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <User className="size-4 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">{t('settings.profile')}</h2>
                <p className="text-xs text-muted-foreground">{t('settings.profileDesc')}</p>
              </div>
            </div>
            <div className="space-y-4">
              <Input
                label={t('user.nickname')}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t('settings.nicknamePlaceholder')}
              />
              <div className="flex justify-end pt-2">
                <Button type="button" variant="primary" size="sm" loading={profileLoading} onClick={() => void saveProfile()}>
                  {t('settings.saveProfile')}
                </Button>
              </div>
            </div>
          </motion.section>

          {/* Phone Section */}
          <motion.section
            className="card-elevated p-6 sm:p-8"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: 0.125 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10">
                <Phone className="size-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {hasPhone
                    ? t('settings.changePhone', '修改手机号')
                    : t('settings.bindPhone', '绑定手机号')}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {hasPhone
                    ? t('settings.changePhoneDesc', '当前手机号 {{phone}}，使用新号码接收验证码后即可更换', {
                        phone: formatPhone(user!.phone),
                      })
                    : t('settings.bindPhoneDesc', '绑定手机号后即可使用手机号登录、找回密码')}
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="settings-new-phone">{t('settings.newPhone', '新手机号')}</Label>
                <CnPhoneInput
                  id="settings-new-phone"
                  value={newPhone}
                  onChange={setNewPhone}
                  placeholder={t('settings.newPhonePlaceholder', '请输入新的 11 位手机号')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-phone-code">{t('auth.smsCode')}</Label>
                <SmsCodeInput
                  id="settings-phone-code"
                  value={phoneCode}
                  onChange={setPhoneCode}
                  onSend={sendPhoneCode}
                  canSend={isCnPhoneValid(newPhone)}
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={phoneLoading}
                  disabled={!isCnPhoneValid(newPhone) || phoneCode.length !== 6}
                  onClick={() => void savePhone()}
                >
                  {hasPhone
                    ? t('settings.savePhone', '更新手机号')
                    : t('settings.bindPhoneAction', '绑定手机号')}
                </Button>
              </div>
            </div>
          </motion.section>

          {/* Security Section */}
          <motion.section
            className="card-elevated p-6 sm:p-8"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: 0.15 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10">
                <Shield className="size-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {hasPassword ? t('settings.security') : t('settings.setPassword', '设置登录密码')}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {hasPassword
                    ? t('settings.securityDesc')
                    : t('settings.setPasswordDesc', '你当前通过手机号验证码登录，设置密码后即可使用「手机号 + 密码」登录')}
                </p>
              </div>
            </div>
            {hasPhone ? (
              // 已绑定手机号：一律走短信验证码改密码（更安全），不再接受旧密码
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="settings-pwd-code">{t('auth.smsCode')}</Label>
                  <SmsCodeInput
                    id="settings-pwd-code"
                    value={pwdCode}
                    onChange={setPwdCode}
                    onSend={sendPwdCode}
                    canSend={hasPhone}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('settings.smsCodeToPhone', '验证码将发送至当前手机号 {{phone}}', {
                      phone: formatPhone(user!.phone),
                    })}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    type="password"
                    label={t('settings.newPassword')}
                    hint={t('settings.newPasswordHint')}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="••••••••"
                  />
                  <Input
                    type="password"
                    label={t('settings.confirmPassword')}
                    hint={t('settings.confirmPasswordHint')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="••••••••"
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="button" variant="primary" size="sm" loading={passwordLoading} onClick={() => void savePassword()}>
                    {hasPassword ? t('settings.updatePassword') : t('settings.setPasswordAction', '设置密码')}
                  </Button>
                </div>
              </div>
            ) : (
              // 未绑定手机号：用当前密码修改
              <div className="space-y-4">
                <Input
                  type="password"
                  label={t('settings.currentPassword')}
                  hint={t('settings.currentPasswordHint')}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    type="password"
                    label={t('settings.newPassword')}
                    hint={t('settings.newPasswordHint')}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="••••••••"
                  />
                  <Input
                    type="password"
                    label={t('settings.confirmPassword')}
                    hint={t('settings.confirmPasswordHint')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="••••••••"
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="button" variant="primary" size="sm" loading={passwordLoading} onClick={() => void savePassword()}>
                    {t('settings.updatePassword')}
                  </Button>
                </div>
              </div>
            )}
          </motion.section>
        </div>
      </div>
    </PageContainer>
  )
}
