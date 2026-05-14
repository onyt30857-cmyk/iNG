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
  ClipboardCheck,
  Settings,
  Settings2,
  Wallet,
  Heart,
  Menu,
  X,
  AlertCircle,
  History,
  Sparkles,
  ShieldAlert,
  ShoppingBag,
  Undo2,
  LayoutGrid,
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

interface NavGroup {
  /** 分组标题(顶部"总览"等独立项 group=null)*/
  group: string | null
  /** 副标题/解释,提示运营这组干啥的 */
  hint?: string
  items: NavItem[]
}

// 按用户场景分类(spec-027)
const NAV_GROUPS: NavGroup[] = [
  {
    group: null,
    items: [{ href: '/dashboard', label: '总览', icon: LayoutDashboard }],
  },
  {
    group: '运营',
    hint: '看用户在用什么',
    items: [
      { href: '/users', label: '用户', icon: Users },
      { href: '/relationships', label: '关系', icon: Heart },
      { href: '/feedback', label: '反馈', icon: MessageSquareWarning },
      { href: '/feedback/product', label: '产品反馈', icon: MessageSquareWarning },
    ],
  },
  {
    group: 'AI 质量',
    hint: '老白说得好不好',
    items: [
      { href: '/llm', label: 'AI 监控', icon: Activity },
      { href: '/moderation-logs', label: '红线触发', icon: ShieldAlert },
      { href: '/annotations', label: '人工评分', icon: ClipboardCheck },
    ],
  },
  {
    group: '老白配置',
    hint: '改老白本身',
    items: [
      { href: '/laoke', label: '老白档案', icon: Sparkles },
    ],
  },
  {
    group: '营收',
    hint: '商品 / 退款 / API 余额',
    items: [
      { href: '/billing/overview', label: 'Phase 1 概览', icon: LayoutGrid },
      { href: '/billing/products', label: '商品定价', icon: ShoppingBag },
      { href: '/billing/refunds', label: '退款工单', icon: Undo2 },
      { href: '/settings/billing', label: 'Claude 余额', icon: Wallet },
    ],
  },
  {
    group: '系统',
    hint: '全局配置 + 工具',
    items: [
      { href: '/settings/quota', label: '系统配置', icon: Settings },
      { href: '/settings/data-flow', label: '数据流配置', icon: Settings2 },
      { href: '/changelog', label: '迭代记录', icon: History },
      { href: '/errors', label: '错误码字典', icon: AlertCircle },
    ],
  },
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

      <nav className="flex-1 p-3 overflow-y-auto">
        {NAV_GROUPS.map((g, gi) => (
          <div key={g.group ?? '__root__'} className={gi > 0 ? 'mt-4' : ''}>
            {g.group && (
              <div className="px-3 pt-1.5 pb-1 flex items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {g.group}
                </span>
                {g.hint && (
                  <span className="text-[10px] text-muted-foreground/50 truncate">
                    · {g.hint}
                  </span>
                )}
              </div>
            )}
            <div className="space-y-0.5">
              {g.items.map((item) => {
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
            </div>
          </div>
        ))}
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
  const allItems = NAV_GROUPS.flatMap((g) => g.items)
  const current = allItems.find(
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
