import { Link } from 'react-router-dom'
import { LogOut, Settings, UserCircle2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { RoleBadge, roleLabel } from '@/components/layout/RoleBadge'
import { useAdminAuthStore } from '@/stores/adminAuthStore'

/** 浮动 Header：absolute top + glass-soft + backdrop-blur */
export function AdminHeader({ className }: { className?: string }) {
  const { user, logout } = useAdminAuthStore()

  const handleLogout = () => {
    logout()
    window.location.href = '/admin/login'
  }

  return (
    <header
      className={cn(
        'absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 px-4 sm:px-6',
        'bg-[#F6F5FC]/75 backdrop-blur-xl backdrop-saturate-150 dark:bg-background/75',
        className,
      )}
    >
      <div className="flex-1" />

      {/* 醒目角色身份标识 */}
      <RoleBadge role={user?.role} className="mr-1" />

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="menu-hover gap-2 px-2">
            <UserCircle2 className="size-5 text-muted-foreground" strokeWidth={2.1} />
            <span className="hidden text-sm font-medium text-foreground sm:inline">
              {user?.nickname || user?.email || '管理员'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">
              {user?.nickname || '管理员'}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {user?.email}
            </span>
            <span className="mt-0.5 inline-flex w-fit items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {roleLabel(user?.role)}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/admin/settings" className="cursor-pointer">
              <Settings className="size-4" strokeWidth={2.1} />
              平台设置
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="size-4" strokeWidth={2.1} />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
