import { Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState, PageContainer, PageHeader, SectionCard } from '@/components/shared'

export default function ReviewChannelsPage() {
  return (
    <PageContainer size="xl">
      <PageHeader
        title="渠道复盘"
        description="多平台账号与渠道表现对比"
        icon={Users}
        iconAccent="info"
        breadcrumbs={[{ label: '数据分析' }, { label: '渠道复盘' }]}
      />
      <SectionCard variant="elevated" bodyClassName="p-2">
        <EmptyState
          icon={Users}
          title="渠道数据敬请期待"
          description="接入分发数据后将在此处展示各平台表现"
          action={
            <Button variant="outline" disabled>
              即将上线
            </Button>
          }
        />
      </SectionCard>
    </PageContainer>
  )
}
