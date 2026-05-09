'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { adminGet, adminPost } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface VersionItem {
  id: string
  name: string
  version: number
  author: string
  notes: string | null
  deployed_at: string | null
  rolled_back_at: string | null
  rollout_pct: number
  created_at: string
}

interface VersionFull extends VersionItem {
  content: string
}

export default function PromptVersionsPage() {
  const params = useParams<{ name: string }>()
  const name = decodeURIComponent(params.name)
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [viewing, setViewing] = useState<VersionFull | null>(null)
  const [deployingId, setDeployingId] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    const res = await adminGet<{ versions: VersionItem[] }>(
      `/v1/admin/prompts/by-name/${encodeURIComponent(name)}`,
    )
    setLoading(false)
    if (res.ok) setVersions(res.data.versions)
    else setErrorMsg(res.error.message)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  async function viewContent(versionId: string) {
    const res = await adminGet<VersionFull>(`/v1/admin/prompts/versions/${versionId}`)
    if (res.ok) setViewing(res.data)
    else alert(res.error.message)
  }

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/prompts">
          <ArrowLeft className="h-4 w-4" /> 返回 Prompt 列表
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold font-mono">{name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{versions.length} 个版本</p>
      </div>

      {/* spec-025 P0-2:当前 deployed 版本快照预览(不点编辑就能看)*/}
      <DeployedSnapshot versions={versions} viewContent={viewContent} />

      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}
      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      <div className="space-y-2">
        {versions.map((v) => {
          const active = v.deployed_at && !v.rolled_back_at
          return (
            <Card key={v.id} className={active ? 'border-primary' : ''}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">v{v.version}</span>
                    {active && <Badge variant="default">deployed · {v.rollout_pct}%</Badge>}
                    {v.rolled_back_at && <Badge variant="muted">已回滚</Badge>}
                    {!v.deployed_at && <Badge variant="secondary">staging</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(v.created_at)} · 作者 {v.author.slice(0, 8)}
                    {v.notes && ` · ${v.notes}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => viewContent(v.id)}>
                    看内容
                  </Button>
                  {!active && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeployingId(v.id)}
                    >
                      部署
                    </Button>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/prompts/versions/${v.id}/eval`}>eval →</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 看内容 dialog */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono">
              {viewing?.name} v{viewing?.version}
            </DialogTitle>
            <DialogDescription>{viewing?.notes ?? '无说明'}</DialogDescription>
          </DialogHeader>
          <pre className="overflow-auto flex-1 text-xs whitespace-pre-wrap font-mono bg-muted/30 p-3 rounded">
            {viewing?.content}
          </pre>
        </DialogContent>
      </Dialog>

      {/* placeholder for deploy dialog */}
      <DeployDialog
        versionId={deployingId}
        onClose={() => setDeployingId(null)}
        onDeployed={() => {
          setDeployingId(null)
          reload()
        }}
      />
    </div>
  )
}

function DeployDialog({
  versionId,
  onClose,
  onDeployed,
}: {
  versionId: string | null
  onClose: () => void
  onDeployed: () => void
}) {
  const [reason, setReason] = useState('')
  const [pct, setPct] = useState(100)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handle() {
    if (!versionId) return
    setSubmitting(true)
    setErr(null)
    const res = await adminPost(`/v1/admin/prompts/versions/${versionId}/deploy`, {
      rollout_pct: pct,
      reason: reason.trim(),
    })
    setSubmitting(false)
    if (res.ok) {
      setReason('')
      onDeployed()
    } else {
      setErr(res.error.message)
    }
  }

  return (
    <Dialog open={!!versionId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>部署 Prompt 版本</DialogTitle>
          <DialogDescription>
            部署后该版本立即生效,同 prompt name 的旧 deployed 版本被标记为已回滚。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="pct">灰度比例(%)</Label>
            <Input
              id="pct"
              type="number"
              min={1}
              max={100}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              M1 v0 灰度逻辑未真接入(默认 100% 全量),后续 spec-013 §B.2 实施
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="reason">原因(必填)</Label>
            <Input
              id="reason"
              placeholder='例:"修复啰嗦问题,eval 跑通"'
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handle} disabled={submitting || !reason.trim()}>
            {submitting ? '部署中…' : '确认部署'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============== spec-025 P0-2: 当前 deployed 版本快照预览 ==============
function DeployedSnapshot({
  versions,
  viewContent,
}: {
  versions: VersionItem[]
  viewContent: (id: string) => Promise<void>
}) {
  const deployed = versions.find((v) => v.deployed_at && !v.rolled_back_at)
  const [expanded, setExpanded] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function loadContent() {
    if (!deployed) return
    if (content) {
      setExpanded((v) => !v)
      return
    }
    setLoading(true)
    const res = await adminGet<VersionFull>(`/v1/admin/prompts/versions/${deployed.id}`)
    setLoading(false)
    if (res.ok) {
      setContent(res.data.content)
      setExpanded(true)
    }
    void viewContent // unused but keep prop interface stable
  }

  if (!deployed) {
    return (
      <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="p-4 text-sm">
          ⚠️ 当前没有 deployed 的版本。所有 AI 调用会用代码里 hardcode 的默认 prompt。
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-emerald-300 bg-emerald-50/30 dark:bg-emerald-950/10">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-sm font-medium">
              ✓ 当前线上 v{deployed.version}
              {deployed.rollout_pct < 100 && ` · 灰度 ${deployed.rollout_pct}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {deployed.notes ?? '无说明'} · 部署于 {deployed.deployed_at && new Date(deployed.deployed_at).toLocaleDateString('zh-CN')}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadContent} disabled={loading}>
            {loading ? '加载中…' : expanded ? '收起预览' : '展开看完整 prompt'}
          </Button>
        </div>
        {expanded && content && (
          <pre className="overflow-auto max-h-[400px] text-xs whitespace-pre-wrap font-mono bg-background border rounded p-3">
            {content}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}
