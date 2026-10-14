import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/common/Modal'
import { SliderCaptcha } from '@/components/auth/SliderCaptcha'
import { useCaptchaStore } from '@/stores/captchaStore'

/** 全局人机验证宿主：在 App 根挂载一次，配合 requestCaptcha() 使用。 */
export function CaptchaHost() {
  const { t } = useTranslation()
  const open = useCaptchaStore((s) => s.open)
  const succeed = useCaptchaStore((s) => s.succeed)
  const cancel = useCaptchaStore((s) => s.cancel)

  return (
    <Modal open={open} onClose={cancel} title={t('captcha.title', '安全验证')} size="sm">
      {open && <SliderCaptcha onSuccess={succeed} />}
    </Modal>
  )
}
