import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'

interface AgreementCheckboxProps {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  /** 文案前缀：登录页 / 注册页用语略有不同 */
  action?: 'login' | 'register'
}

/**
 * 登录 / 注册页的强制同意勾选框：
 * “[√] 登录即表示您已阅读并同意《用户协议》和《隐私政策》”。
 * 协议名链接在新标签页打开独立阅读页（/legal/agreement | /legal/privacy）。
 */
export function AgreementCheckbox({
  checked,
  onCheckedChange,
  action = 'login',
}: AgreementCheckboxProps) {
  const { t } = useTranslation()

  const prefix =
    action === 'register'
      ? t('auth.agreementRegisterPrefix')
      : t('auth.agreementLoginPrefix')

  const linkCls = 'font-medium text-primary underline-offset-2 hover:underline'

  return (
    <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-muted-foreground">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-0.5 shrink-0"
      />
      <span>
        {prefix}
        <a href="/legal/agreement" target="_blank" rel="noreferrer" className={linkCls}>
          《{t('auth.userAgreement')}》
        </a>
        {t('auth.agreementAnd')}
        <a href="/legal/privacy" target="_blank" rel="noreferrer" className={linkCls}>
          《{t('auth.privacyPolicy')}》
        </a>
      </span>
    </label>
  )
}
