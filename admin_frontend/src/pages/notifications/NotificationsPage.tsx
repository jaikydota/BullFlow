import * as React from 'react'
import {
  Bell,
  Building2,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Send,
  SendHorizontal,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageContainer, PageHeader, SectionCard } from '@/components/shared'
import { ProForm, ProFormField } from '@/components/admin'
import {
  fetchNotificationChannels,
  testNotificationChannelApi,
  updateNotificationChannels,
} from '@/lib/api/saas'
import { ApiBusinessError } from '@/lib/api/schema'

type SmtpConfig = {
  enabled: boolean
  host: string
  port: string
  user: string
  pass: string
  senderName: string
}
type FeishuConfig = { enabled: boolean; webhook: string; secret: string }
type WecomConfig = {
  enabled: boolean
  corpid: string
  agentid: string
  secret: string
}
type Payload = { smtp: SmtpConfig; feishu: FeishuConfig; wecom: WecomConfig }

function defaultPayload(): Payload {
  return {
    smtp: { enabled: false, host: '', port: '465', user: '', pass: '', senderName: '' },
    feishu: { enabled: false, webhook: '', secret: '' },
    wecom: { enabled: false, corpid: '', agentid: '', secret: '' },
  }
}

function mergePayload(raw: unknown): Payload {
  const base = defaultPayload()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const smtpIn =
    o.smtp && typeof o.smtp === 'object' && !Array.isArray(o.smtp)
      ? (o.smtp as Record<string, unknown>)
      : {}
  const feishuIn =
    o.feishu && typeof o.feishu === 'object' && !Array.isArray(o.feishu)
      ? (o.feishu as Record<string, unknown>)
      : {}
  const wecomIn =
    o.wecom && typeof o.wecom === 'object' && !Array.isArray(o.wecom)
      ? (o.wecom as Record<string, unknown>)
      : {}
  const s = (v: unknown, d: string) => (typeof v === 'string' ? v : d)
  return {
    smtp: {
      enabled: Boolean(smtpIn.enabled),
      host: s(smtpIn.host, base.smtp.host),
      port: s(smtpIn.port, base.smtp.port),
      user: s(smtpIn.user, base.smtp.user),
      pass: s(smtpIn.pass, base.smtp.pass),
      senderName: s(smtpIn.senderName, s(smtpIn.sender, base.smtp.senderName)),
    },
    feishu: {
      enabled: Boolean(feishuIn.enabled),
      webhook: s(feishuIn.webhook, base.feishu.webhook),
      secret: s(feishuIn.secret, base.feishu.secret),
    },
    wecom: {
      enabled: Boolean(wecomIn.enabled),
      corpid: s(wecomIn.corpid, base.wecom.corpid),
      agentid: s(wecomIn.agentid, base.wecom.agentid),
      secret: s(wecomIn.secret, base.wecom.secret),
    },
  }
}

export default function NotificationsPage() {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [cfg, setCfg] = React.useState<Payload>(() => defaultPayload())
  const [baselineJson, setBaselineJson] = React.useState('')

  const dirty = React.useMemo(() => JSON.stringify(cfg) !== baselineJson, [cfg, baselineJson])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchNotificationChannels()
      const merged = mergePayload(data)
      setCfg(merged)
      setBaselineJson(JSON.stringify(merged))
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('通知渠道配置加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const saved = await updateNotificationChannels(cfg as unknown as Record<string, unknown>)
      const merged = mergePayload(saved)
      setCfg(merged)
      setBaselineJson(JSON.stringify(merged))
      toast.success('通知渠道已保存')
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const testNotify = async (kind: 'smtp' | 'feishu' | 'wecom') => {
    const label = kind === 'smtp' ? 'SMTP' : kind === 'feishu' ? '飞书' : '企业微信'
    try {
      if (kind === 'smtp') {
        const raw = window.prompt('测试邮件收件人（留空发到 SMTP 用户名）', '')
        if (raw === null) return
        const r = await testNotificationChannelApi({ channel: 'smtp', to_email: raw.trim() || null })
        toast.success(`${label}：${r.detail}`)
        return
      }
      if (kind === 'wecom') {
        const raw = window.prompt('企业微信接收用户 userid（留空 @all）', '')
        if (raw === null) return
        const r = await testNotificationChannelApi({ channel: 'wecom', touser: raw.trim() || null })
        toast.success(`${label}：${r.detail}`)
        return
      }
      const r = await testNotificationChannelApi({ channel: 'feishu' })
      toast.success(`${label}：${r.detail}`)
    } catch (e) {
      if (e instanceof ApiBusinessError) toast.error(e.message)
      else toast.error(`${label} 测试失败`)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="通知通道"
        description="配置系统通知与告警的推送渠道。「发送测试」读取的是已保存配置，请先保存再测"
        icon={Bell}
        iconAccent="info"
        breadcrumbs={[{ label: '平台运营' }, { label: '通知通道' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} disabled={loading || saving}>
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
              ) : (
                <RefreshCw className="size-3.5" strokeWidth={2.25} />
              )}
              重新加载
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saving || loading}>
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
              ) : (
                <Save className="size-3.5" strokeWidth={2.25} />
              )}
              保存配置
            </Button>
          </>
        }
      />

      {dirty && (
        <div className="mb-3 rounded-xl border border-amber-500/35 bg-amber-500/[0.08] px-4 py-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
          您有未保存的更改，请点击右上「保存配置」同步到服务端
        </div>
      )}

      {loading ? (
        <SectionCard>
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
            加载配置…
          </div>
        </SectionCard>
      ) : (
        <Tabs defaultValue="smtp" className="space-y-4">
          <TabsList>
            <TabsTrigger value="smtp" className="gap-2">
              <Mail className="size-3.5" strokeWidth={2.25} />
              邮件 SMTP
            </TabsTrigger>
            <TabsTrigger value="feishu" className="gap-2">
              <Send className="size-3.5" strokeWidth={2.25} />
              飞书
            </TabsTrigger>
            <TabsTrigger value="wecom" className="gap-2">
              <Building2 className="size-3.5" strokeWidth={2.25} />
              企业微信
            </TabsTrigger>
          </TabsList>

          <TabsContent value="smtp">
            <SectionCard
              title="邮件 SMTP"
              description="用于发送系统通知、账单、验证码等邮件"
              icon={Mail}
              iconAccent="primary"
              actions={
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">启用</span>
                  <Switch
                    checked={cfg.smtp.enabled}
                    onCheckedChange={(enabled) =>
                      setCfg((c) => ({ ...c, smtp: { ...c.smtp, enabled } }))
                    }
                  />
                </div>
              }
            >
              <ProForm layout="2-col">
                <ProFormField label="SMTP 服务器" required fullWidth>
                  <Input
                    placeholder="smtp.example.com"
                    value={cfg.smtp.host}
                    onChange={(e) =>
                      setCfg((c) => ({ ...c, smtp: { ...c.smtp, host: e.target.value } }))
                    }
                  />
                </ProFormField>
                <ProFormField label="端口">
                  <Input
                    placeholder="465"
                    value={cfg.smtp.port}
                    onChange={(e) =>
                      setCfg((c) => ({ ...c, smtp: { ...c.smtp, port: e.target.value } }))
                    }
                  />
                </ProFormField>
                <ProFormField label="发件人名称">
                  <Input
                    placeholder="例如：推量牛"
                    value={cfg.smtp.senderName}
                    onChange={(e) =>
                      setCfg((c) => ({ ...c, smtp: { ...c.smtp, senderName: e.target.value } }))
                    }
                  />
                </ProFormField>
                <ProFormField label="用户名">
                  <Input
                    placeholder="noreply@example.com"
                    value={cfg.smtp.user}
                    onChange={(e) =>
                      setCfg((c) => ({ ...c, smtp: { ...c.smtp, user: e.target.value } }))
                    }
                  />
                </ProFormField>
                <ProFormField label="密码">
                  <Input
                    type="password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    value={cfg.smtp.pass}
                    onChange={(e) =>
                      setCfg((c) => ({ ...c, smtp: { ...c.smtp, pass: e.target.value } }))
                    }
                  />
                </ProFormField>
              </ProForm>
              <div className="mt-4 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => testNotify('smtp')}>
                  <SendHorizontal className="size-3.5" strokeWidth={2.25} />
                  发送测试邮件
                </Button>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="feishu">
            <SectionCard
              title="飞书"
              description="通过飞书机器人向运营人员发送告警和通知"
              icon={Send}
              iconAccent="info"
              actions={
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">启用</span>
                  <Switch
                    checked={cfg.feishu.enabled}
                    onCheckedChange={(enabled) =>
                      setCfg((c) => ({ ...c, feishu: { ...c.feishu, enabled } }))
                    }
                  />
                </div>
              }
            >
              <ProForm layout="1-col">
                <ProFormField label="Webhook URL" required>
                  <Input
                    placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
                    value={cfg.feishu.webhook}
                    onChange={(e) =>
                      setCfg((c) => ({ ...c, feishu: { ...c.feishu, webhook: e.target.value } }))
                    }
                  />
                </ProFormField>
                <ProFormField label="签名校验密钥" hint="可选">
                  <Input
                    value={cfg.feishu.secret}
                    onChange={(e) =>
                      setCfg((c) => ({ ...c, feishu: { ...c.feishu, secret: e.target.value } }))
                    }
                  />
                </ProFormField>
              </ProForm>
              <div className="mt-4 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => testNotify('feishu')}>
                  <SendHorizontal className="size-3.5" strokeWidth={2.25} />
                  发送测试消息
                </Button>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="wecom">
            <SectionCard
              title="企业微信"
              description="通过企业微信应用向管理员推送通知"
              icon={Building2}
              iconAccent="success"
              actions={
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">启用</span>
                  <Switch
                    checked={cfg.wecom.enabled}
                    onCheckedChange={(enabled) =>
                      setCfg((c) => ({ ...c, wecom: { ...c.wecom, enabled } }))
                    }
                  />
                </div>
              }
            >
              <ProForm layout="2-col">
                <ProFormField label="CorpID" required>
                  <Input
                    placeholder="企业 ID"
                    value={cfg.wecom.corpid}
                    onChange={(e) =>
                      setCfg((c) => ({ ...c, wecom: { ...c.wecom, corpid: e.target.value } }))
                    }
                  />
                </ProFormField>
                <ProFormField label="AgentID" required>
                  <Input
                    placeholder="应用 AgentId"
                    value={cfg.wecom.agentid}
                    onChange={(e) =>
                      setCfg((c) => ({ ...c, wecom: { ...c.wecom, agentid: e.target.value } }))
                    }
                  />
                </ProFormField>
                <ProFormField label="Secret" required fullWidth>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    value={cfg.wecom.secret}
                    onChange={(e) =>
                      setCfg((c) => ({ ...c, wecom: { ...c.wecom, secret: e.target.value } }))
                    }
                  />
                </ProFormField>
              </ProForm>
              <div className="mt-4 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => testNotify('wecom')}>
                  <SendHorizontal className="size-3.5" strokeWidth={2.25} />
                  发送测试消息
                </Button>
              </div>
            </SectionCard>
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  )
}
