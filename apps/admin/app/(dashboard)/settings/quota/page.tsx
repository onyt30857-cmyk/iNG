'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Coins, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { adminFetch, adminGet } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface QuotaConfig {
  daily_free_points: number
  quota_bypass_enabled: boolean
  // 兼容老字段(运维查问题用,不再编辑)
  quota_turn: number
  quota_ocr: number
  quota_heavy: number
  updated_by: string | null
  updated_at: string
}

export default function QuotaSettingsPage() {
  const [config, setConfig] = useState<QuotaConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const [pointsLimit, setPointsLimit] = useState(100)
  const [bypassEnabled, setBypassEnabled] = useState(true)

  async function load() {
    setLoading(true)
    const res = await adminGet<QuotaConfig>('/v1/admin/settings/quota')
    setLoading(false)
    if (res.ok) {
      setConfig(res.data)
      setPointsLimit(res.data.daily_free_points)
      setBypassEnabled(res.data.quota_bypass_enabled)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const res = await adminFetch<QuotaConfig>('/v1/admin/settings/quota', {
      method: 'PATCH',
      body: {
        daily_free_points: pointsLimit,
        quota_bypass_enabled: bypassEnabled,
      },
    })
    if (res.ok) {
      setConfig(res.data)
      setSavedAt(Date.now())
    } else {
      setErrorMsg(res.error.message)
    }
  }

  // 翻译:N 积分 = 几句话/几张截图(产品 spec-019:turn=5, ocr=20, heavy=30)
  const translateText = `每天 ${pointsLimit} 积分 ≈ ${Math.floor(pointsLimit / 5)} 句对话 / ${Math.floor(pointsLimit / 20)} 张截图复盘 / ${Math.floor(pointsLimit / 30)} 次深度画像`

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Coins className="h-5 w-5" /> 免费用户 · 每日积分上限
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          每个免费用户每天能用多少积分,在这里改 — 保存即生效(后端 5 分钟缓存内会过渡)
        </p>
      </div>

      {bypassEnabled && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-medium text-amber-900 dark:text-amber-300">
              &quot;全量 bypass&quot; 开启中 — 积分限制都不生效
            </div>
            <div className="text-sm text-muted-foreground">
              所有免费用户<strong>不被限制</strong>,跟订阅用户一样无限用。
              <strong>M1 上线前必须关掉</strong>,否则没收费意义。
            </div>
          </div>
        </div>
      )}

      {savedAt && (
        <div className="rounded-md border border-green-300 bg-green-50/50 dark:bg-green-950/20 p-3 flex items-center gap-2 text-sm text-green-800 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          已保存,5 分钟内全后端会读到新值
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {!loading && (
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">每日免费积分</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="points">🪙 每日积分上限</Label>
                <Input
                  id="points"
                  type="number"
                  min={0}
                  max={10000}
                  value={pointsLimit}
                  onChange={(e) => setPointsLimit(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  {translateText}
                </p>
              </div>

              {/* 积分换算说明 */}
              <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1.5">
                <div className="font-medium text-foreground">📋 积分扣减规则(spec-019)</div>
                <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                  <div>跟老白说话 <strong className="text-foreground">5</strong> 积分/句</div>
                  <div>截图复盘 <strong className="text-foreground">20</strong> 积分/张</div>
                  <div>深度画像 <strong className="text-foreground">30</strong> 积分/次</div>
                </div>
                <div className="text-muted-foreground pt-1 border-t mt-2">
                  AI 失败 / 红线触发 → 自动退积分
                </div>
              </div>

              <div className="border-t pt-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bypassEnabled}
                    onChange={(e) => setBypassEnabled(e.target.checked)}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium">全量 bypass(M1 内测期)</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      勾选 = 积分限制<strong>完全不生效</strong>(所有用户无限用)。
                      M1 内测期默认开,真上线收费时取消勾选。
                    </div>
                  </div>
                </label>
              </div>

              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            </CardContent>
            <div className="flex justify-between items-center px-6 pb-6">
              <span className="text-xs text-muted-foreground">
                {config?.updated_at && `上次改:${new Date(config.updated_at).toLocaleString('zh-CN')}`}
                {config?.updated_by && ` · admin ${config.updated_by.slice(0, 8)}`}
              </span>
              <Button type="submit">保存(立刻生效)</Button>
            </div>
          </Card>
        </form>
      )}

      <Card>
        <CardContent className="pt-5 text-xs text-muted-foreground space-y-1">
          <p>📌 <strong>不影响订阅用户</strong>:订阅 ACTIVE 用户始终 bypass,这里改的是<strong>免费用户</strong>的上限。</p>
          <p>📌 <strong>不影响已发对话</strong>:改了上限,只对<strong>之后</strong>的请求生效。</p>
          <p>📌 <strong>所有改动留痕</strong>:审计日志(admin_audit_logs)会记录&quot;谁改了什么时候改的 from→to&quot;。</p>
        </CardContent>
      </Card>
    </div>
  )
}
