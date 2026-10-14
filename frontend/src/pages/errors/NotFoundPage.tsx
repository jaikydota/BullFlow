import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FileQuestion, Home } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { ROUTES } from '@/utils/constants'

export default function NotFoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16">
      {/* 装饰光斑 */}
      <div className="blob-primary -left-32 top-16 size-96 opacity-60" aria-hidden />
      <div className="blob-rose -right-24 bottom-16 size-80 opacity-50" aria-hidden />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 flex max-w-md flex-col items-center text-center"
      >
        <span className="mb-6 flex size-20 items-center justify-center rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 to-pink-500/15 shadow-card">
          <FileQuestion className="size-10 text-primary" strokeWidth={2.1} aria-hidden />
        </span>
        <p
          className="text-7xl font-black tracking-tight text-transparent sm:text-8xl"
          style={{
            backgroundImage:
              'linear-gradient(135deg, oklch(0.55 0.25 285), oklch(0.65 0.22 295), oklch(0.62 0.22 15))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
          }}
        >
          404
        </p>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
          {t('errors.notFound')}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t('errors.notFoundMessage')}
        </p>
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="mt-8 min-w-[10rem]"
          onClick={() => navigate(ROUTES.DASHBOARD)}
        >
          <Home className="size-4" />
          {t('errors.goHome')}
        </Button>
      </motion.div>
    </div>
  )
}
