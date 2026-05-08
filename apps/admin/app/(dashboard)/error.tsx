'use client'

// Next.js 14 App Router error boundary
// dashboard segment 下任何 client 端错误被这个组件捕获,sidebar 仍正常显示
// 不再整屏白屏

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 在浏览器 console 留个痕迹方便排查(server logs 已有 Vercel 抓)
    // eslint-disable-next-line no-console
    console.error('[admin dashboard error]', error)
  }, [error])

  return (
    <div className="container max-w-2xl py-12">
      <Card>
        <CardContent className="p-8 space-y-5 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-amber-100 dark:bg-amber-950/40 p-4">
              <AlertTriangle className="h-8 w-8 text-amber-700 dark:text-amber-500" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-semibold">这块出了点问题</h1>
            <p className="text-sm text-muted-foreground">
              页面里有个组件崩了,但其他地方还能用。点"重试"试试,
              或者去其他模块继续。
            </p>
          </div>

          {/* 错误详情(运营看不懂可忽略,工程师调试用) */}
          <details className="text-left rounded-md border bg-muted/40 p-3 text-xs">
            <summary className="cursor-pointer text-muted-foreground select-none">
              查看错误详情(给开发的)
            </summary>
            <div className="mt-2 space-y-1 font-mono">
              <div>
                <span className="text-muted-foreground">message:</span>{' '}
                <span className="text-destructive">{error.message || '(空)'}</span>
              </div>
              {error.digest && (
                <div>
                  <span className="text-muted-foreground">digest:</span>{' '}
                  <span>{error.digest}</span>
                </div>
              )}
              {error.stack && (
                <pre className="mt-2 overflow-auto max-h-48 whitespace-pre-wrap text-[11px]">
                  {error.stack.split('\n').slice(0, 8).join('\n')}
                </pre>
              )}
            </div>
          </details>

          <div className="flex justify-center gap-3 pt-2">
            <Button onClick={() => reset()}>
              <RotateCcw className="h-4 w-4" /> 重试这页
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">
                <Home className="h-4 w-4" /> 回总览
              </Link>
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground pt-2">
            持续报错 → 截图给开发,带上"错误详情"里的 digest
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
