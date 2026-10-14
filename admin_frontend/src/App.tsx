import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import { router } from '@/router'
import { ThemeProvider } from '@/components/theme/ThemeProvider'

export function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <RouterProvider router={router} />
        <Toaster
          position="top-right"
          containerStyle={{ zIndex: 999999 }}
          toastOptions={{
            className: 'bg-card text-foreground border border-border shadow-md',
            style: {
              background: 'var(--card)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            },
          }}
        />
      </div>
    </ThemeProvider>
  )
}
