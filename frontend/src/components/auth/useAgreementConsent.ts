import { useState } from 'react'

import { storage } from '@/utils/storage'

const CONSENT_KEY = 'agreement_consent'

/**
 * 协议同意状态，持久化到 localStorage：用户首次勾选后，后续访问登录/注册页自动勾选，
 * 无需每次重复勾选。返回 [agreed, setAgreed]，setAgreed 会同步落盘。
 */
export function useAgreementConsent(): [boolean, (v: boolean) => void] {
  const [agreed, setAgreedState] = useState(() => storage.get<boolean>(CONSENT_KEY) === true)

  const setAgreed = (v: boolean) => {
    setAgreedState(v)
    storage.set(CONSENT_KEY, v)
  }

  return [agreed, setAgreed]
}
