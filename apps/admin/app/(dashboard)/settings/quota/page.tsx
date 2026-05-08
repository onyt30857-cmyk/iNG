'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Settings, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { adminFetch, adminGet } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface QuotaConfig {
  quota_turn: number
  quota_ocr: number
  quota_heavy: number
  quota_bypass_enabled: boolean
  updated_by: string | null
  updated_at: string
}

export default function QuotaSettingsPage() {
  const [config, setConfig] = useState<QuotaConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // 表单值
  const [turnLimit, setTurnLimit] = useState(20)
  const [ocrLimit, setOcrLimit] = useState(5)
  const [heavyLimit, setHeavyLimit] = useState(3)
  const [bypassEnabled, setBypassEnabled] = useState(true)

  async function load() {
    setLoading(true)
    const res = await adminGet<QuotaConfig>('/v1/admin/settings/quota')
    setLoading(false)
    if (res.ok) {
      setConfig(res.data)
      setTurnLimit(res.data.quota_turn)
      setOcrLimit(res.data.quota_ocr)
      setHeavyLimit(res.data.quota_heavy)
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
        quota_turn: turnLimit,
        quota_ocr: ocrLimit,
        quota_heavy: heavyLimit,
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

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Settings className="h-5 w-5" /> 系统配置 · 免费额度
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          每个免费用户每天能用多少次,在这里改 — 保存即生效(后端 5 分钟缓存内会过渡)
        </p>
      </div>

      {/* 关键警告:bypass 开关 */}
      {bypassEnabled && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-medium text-amber-900 dark:text-amber-300">
              "全量 bypass" 开启中 — 所有限制都不生效
            </div>
            <div className="text-sm text-muted-foreground">
              所有免费用户**不被限制**,跟订阅用户一样无限用。
              **M1 上线前必须关掉**,否则没收费意义。
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
              <CardTitle className="text-base">免费用户每日额度</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="turn">💬 对话次数(turn)</Label>
                <Input
                  id="turn"
                  type="number"
                  min={0}
                  max={10000}
                  value={turnLimit}
                  onChange={(e) => setTurnLimit(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  每用户每天最多跟老 K 说几次话。**建议 50** — 够普通用户每天 5-10 次完整复盘。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ocr">📷 上传截图复盘(ocr)</Label>
                <Input
                  id="ocr"
                  type="number"
                  min={0}
                  max={10000}
                  value={ocrLimit}
                  onChange={(e) => setOcrLimit(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  每天最多上传几张聊天截图。**建议 8**(每张截图后续会带 5-10 次 turn)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="heavy">⚙️ 重操作(heavy)</Label>
                <Input
                  id="heavy"
                  type="number"
                  min={0}
                  max={10000}
                  value={heavyLimit}
                  onChange={(e) => setHeavyLimit(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  抽取关系画像 / 生成洞察 等耗算力操作。**建议 5**。
                </p>
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
                      勾选 = 上面三个限制都**完全不生效**(所有用户无限用)。
                      M1 内测期默认开,真上线收费时取消勾选。
                    </div>
                  </div>
                </label>
              </div>

              {errorMsg && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}
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
          <p>📌 <strong>不影响订阅用户</strong>:订阅 ACTIVE 用户始终 bypass,这里改的是**免费用户**的上限。</p>
          <p>📌 <strong>不影响已发对话</strong>:改了上限,只对**之后**的请求生效。</p>
          <p>📌 <strong>所有改动留痕</strong>:审计日志(admin_audit_logs)会记录"谁改了什么时候改的 from→to"。</p>
        </CardContent>
      </Card>
    </div>
  )
}
