'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, MessageSquareWarning, LayoutDashboard, LogOut, Activity, FileCode2, ClipboardCheck, Settings, Wallet, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { auth } from '@/lib/auth'
import { useRouter } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: '总览', icon: LayoutDashboard },
  { href: '/users', label: '用户', icon: Users },
  { href: '/relationships', label: '关系', icon: Heart },
  { href: '/feedback', label: '反馈', icon: MessageSquareWarning },
  { href: '/llm', label: 'AI 监控', icon: Activity },
  { href: '/prompts', label: 'Prompt 工程', icon: FileCode2 },
  { href: '/annotations', label: '人工评分', icon: ClipboardCheck },
  { href: '/settings/quota', label: '系统配置', icon: Settings },
  { href: '/settings/billing', label: 'Claude 余额', icon: Wallet },
  // M2 阶段加:红线 / 数据分析 / 隐私 / 运维
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const profile = typeof window !== 'undefined' ? auth.getProfile() : null

  function handleLogout() {
    auth.logout()
    router.push('/login')
  }

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex h-16 items-center border-b px-6">
        <span className="text-lg font-semibold">练爱 Admin</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-secondary text-secondary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t p-3">
        {profile && (
          <div className="mb-2 px-3 text-xs text-muted-foreground">
            <div className="truncate">{profile.email}</div>
            <div className="text-[10px] uppercase tracking-wider">{profile.role}</div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          退出
        </Button>
      </div>
    </aside>
  )
}
