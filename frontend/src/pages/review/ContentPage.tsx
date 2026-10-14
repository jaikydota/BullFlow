import { PieChart } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState, PageContainer, PageHeader, SectionCard } from '@/components/shared'

export default function ReviewContentPage() {
  return (
    <PageContainer size="xl">
      <PageHeader
        title="内容复盘"
        description="按内容类型、发布平台分析效果"
        icon={PieChart}
        iconAccent="primary"
        breadcrumbs={[{ label: '数据分析' }, { label: '内容复盘' }]}
      />
      <SectionCard variant="elevated" bodyClassName="p-2">
        <EmptyState
          icon={PieChart}
          title="内容复盘数据即将到来"
          description="接入数据后将在此处展示内容效果分析"
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
