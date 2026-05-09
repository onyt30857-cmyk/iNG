'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar, MobileTopbar } from '@/components/dashboard/sidebar'
import { BalanceBanner } from '@/components/dashboard/balance-banner'
import { auth } from '@/lib/auth'

/**
 * Dashboard 路由组的 layout — 客户端鉴权门
 * 未登录 → 跳 /login
 *
 * 注意:这里用客户端检查(token 存 localStorage),所以无 SSR 鉴权。
 * Phase E 简化方案;M2 可换 httpOnly cookie + middleware 做服务端鉴权
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!auth.isAuthed()) {
      router.replace('/login')
      return
    }
    setReady(true)
  }, [router])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <MobileTopbar />
        <BalanceBanner />
        <div className="flex-1">{children}</div>
      </main>
    </div>
  )
}
