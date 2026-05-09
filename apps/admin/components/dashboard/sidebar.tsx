'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Users,
  MessageSquareWarning,
  LayoutDashboard,
  LogOut,
  Activity,
  FileCode2,
  ClipboardCheck,
  Settings,
  Wallet,
  Heart,
  Menu,
  X,
} from 'lucide-react'
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
]

/**
 * Sidebar — desktop (md+) 固定显示;mobile (< md) 抽屉滑出。
 * 移动端通过 MobileTopbar 的汉堡按钮触发开关。
 */
export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const profile = typeof window !== 'undefined' ? auth.getProfile() : null
  const [mobileOpen, setMobileOpen] = useState(false)

  // pathname 变化关闭 drawer
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // mobile drawer 打开时锁滚动
  useEffect(() => {
    if (mobileOpen) {
      const orig = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = orig
      }
    }
  }, [mobileOpen])

  function handleLogout() {
    auth.logout()
    router.push('/login')
  }

  // 全局事件:供 MobileTopbar 触发开关
  useEffect(() => {
    const handler = () => setMobileOpen((v) => !v)
    window.addEventListener('admin:toggle-sidebar', handler)
    return () => window.removeEventListener('admin:toggle-sidebar', handler)
  }, [])

  const navContent = (
    <>
      <div className="flex h-16 items-center justify-between border-b px-6">
        <span className="text-lg font-semibold">练爱 Admin</span>
        {/* mobile 关闭按钮 */}
        <button
          className="md:hidden p-1 -mr-1 text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(false)}
          aria-label="关闭菜单"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {NAV.map((item) => {
          const Icon = item.icon
          const active =
            pathname === item.href || pathname.startsWith(item.href + '/')
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
            <div className="text-[10px] uppercase tracking-wider">
              {profile.role}
            </div>
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
    </>
  )

  return (
    <>
      {/* desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col">
        {navContent}
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <aside
            className="absolute left-0 top-0 bottom-0 w-64 bg-card border-r flex flex-col shadow-lg animate-in slide-in-from-left duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {navContent}
          </aside>
        </div>
      )}
    </>
  )
}

/**
 * 移动端顶栏 — 显示汉堡按钮 + 当前页标题。md+ 隐藏。
 */
export function MobileTopbar() {
  const pathname = usePathname()
  const current = NAV.find(
    (n) => pathname === n.href || pathname.startsWith(n.href + '/'),
  )

  return (
    <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 border-b bg-card">
      <button
        className="p-1 -ml-1 text-foreground"
        onClick={() =>
          window.dispatchEvent(new CustomEvent('admin:toggle-sidebar'))
        }
        aria-label="打开菜单"
      >
        <Menu className="h-5 w-5" />
      </button>
      <span className="text-base font-semibold">
        {current?.label ?? '练爱 Admin'}
      </span>
    </div>
  )
}
