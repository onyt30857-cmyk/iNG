// 总览页 — Phase E 占位,Phase F 加 KPI 卡 + 业务图表

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">总览</h1>
        <p className="text-sm text-muted-foreground mt-1">
          M1 内测期。Phase F 加完整 KPI 看板。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">用户管理</CardTitle>
            <CardDescription>查用户 / 订阅 / 配额 / 强制注销</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            进入 / 用户 标签查看
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">反馈闭环</CardTitle>
            <CardDescription>看 👎 / 💬 / 翻车现场</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            进入 / 反馈 标签查看
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">M2 待补</CardTitle>
            <CardDescription>LLM 监控 / 红线 / 数据 / 隐私</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            spec-011 §9 W2-W4 排期
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
