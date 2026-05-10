'use client'

// 画像数据管理页 - spec-m2-005
// admin 查 / 改 / 删某段关系的 4 类画像数据

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, RefreshCcw, Trash2, Pencil } from 'lucide-react'
import { adminFetch, adminGet } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ProfileSnapshot {
  relationship: {
    id: string
    user_id: string
    name: string
    stage: string
    created_at: string
  } | null
  assertions: Array<{
    id: string
    assertion_text: string
    confidence: number
    priority: number
    created_at: string
    user_disputed: boolean
  }>
  observations: Array<{
    id: string
    observation_text: string
    observation_type: string
    confidence: number
    created_at: string
    user_disputed: boolean
  }>
  long_term_memory: {
    summary: string
    covered_until_count: number
    generated_at: string
    updated_at: string
  } | null
  language_fingerprint: {
    preferred_phrases: string[]
    uses_emoji: boolean
    uses_period: boolean
    message_length: string
    formality: number
    emotionality: number
    sample_count: number
    updated_at: string
  } | null
}

export default function RelationshipProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setErrorMsg(null)
    const res = await adminGet<ProfileSnapshot>(
      `/v1/admin/relationships/${id}/profile`,
    )
    setLoading(false)
    if (res.ok) setSnapshot(res.data)
    else setErrorMsg(res.error.message)
  }

  useEffect(() => {
    load()
  }, [id])

  async function handleEditAssertion(assertionId: string, currentText: string) {
    const next = window.prompt('编辑 assertion 文本:', currentText)
    if (next == null || next.trim() === currentText.trim()) return
    setBusy(true)
    const res = await adminFetch(
      `/v1/admin/relationships/${id}/assertions/${assertionId}`,
      { method: 'PATCH', body: { assertion_text: next.trim() } },
    )
    setBusy(false)
    if (!res.ok) {
      alert(`改失败:${res.error.message}`)
      return
    }
    await load()
  }

  async function handleDeleteAssertion(assertionId: string) {
    if (!window.confirm('确认软删除这条 assertion?(可后续从 admin_audit_logs 恢复)')) return
    setBusy(true)
    const res = await adminFetch(
      `/v1/admin/relationships/${id}/assertions/${assertionId}`,
      { method: 'DELETE' },
    )
    setBusy(false)
    if (!res.ok) alert(`删失败:${res.error.message}`)
    else await load()
  }

  async function handleDeleteObservation(observationId: string) {
    if (!window.confirm('确认软删除这条 observation?')) return
    setBusy(true)
    const res = await adminFetch(
      `/v1/admin/relationships/${id}/observations/${observationId}`,
      { method: 'DELETE' },
    )
    setBusy(false)
    if (!res.ok) alert(`删失败:${res.error.message}`)
    else await load()
  }

  async function handleRegenerateLongTermMemory() {
    if (
      !window.confirm(
        '重生成长期记忆摘要?(失效缓存,下次老白回复时自动重算 — 会多消耗一次 Haiku 调用)',
      )
    )
      return
    setBusy(true)
    const res = await adminFetch(
      `/v1/admin/relationships/${id}/long-term-memory/regenerate`,
      { method: 'POST' },
    )
    setBusy(false)
    if (!res.ok) alert(`失败:${res.error.message}`)
    else {
      alert('已失效缓存,下次老白回复时会自动重生成')
      await load()
    }
  }

  async function handleClearAllProfile() {
    const reason = window.prompt(
      '清空所有 assertions + observations + 长期记忆缓存(messages 不动)。\n请填原因(≥5 字):',
    )
    if (!reason || reason.trim().length < 5) {
      alert('清空必须填 reason(≥5 字)')
      return
    }
    if (
      !window.confirm(
        `再次确认:清空「${snapshot?.relationship?.name ?? id}」所有画像数据?`,
      )
    )
      return
    setBusy(true)
    const res = await adminFetch<{
      assertions_cleared: number
      observations_cleared: number
    }>(`/v1/admin/relationships/${id}/clear-all-profile`, {
      method: 'POST',
      body: { reason: reason.trim() },
    })
    setBusy(false)
    if (!res.ok) alert(`失败:${res.error.message}`)
    else {
      alert(
        `已清空:assertions ${res.data.assertions_cleared} / observations ${res.data.observations_cleared}`,
      )
      await load()
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">加载中...</div>
  }
  if (errorMsg || !snapshot || !snapshot.relationship) {
    return (
      <div className="p-6 text-sm text-red-600 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        {errorMsg ?? '关系不存在'}
      </div>
    )
  }

  const rel = snapshot.relationship

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/relationships" className="text-muted-foreground hover:underline flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> 关系列表
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">画像数据管理 — {rel.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {rel.stage} · 用户 {rel.user_id} · 创建于 {formatDate(rel.created_at)}
        </p>
      </div>

      <Card>
        <CardContent className="text-sm pt-6 space-y-2 bg-blue-50 dark:bg-blue-950/30 border-blue-200">
          <div className="font-semibold text-blue-900 dark:text-blue-200">这页是干嘛的</div>
          <p className="text-blue-900 dark:text-blue-200">
            这是老白对「{rel.name}」的"长期理解"。改 / 删后下次老白回复立即用新数据(长期记忆缓存自动失效)。
          </p>
          <p className="text-blue-900 dark:text-blue-200">
            messages 表(原始消息)不在这里管 — 走 user 详情或 conversation 查阅器。
          </p>
        </CardContent>
      </Card>

      {/* 1. profile_assertions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>精炼断言 ({snapshot.assertions.length} 条)</span>
            <span className="text-xs text-muted-foreground font-normal">
              priority desc + confidence desc
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {snapshot.assertions.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">还没积累出来</div>
          ) : (
            snapshot.assertions.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-2 py-2 px-3 hover:bg-muted/50 rounded text-sm"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{a.assertion_text}</span>
                    {a.user_disputed && (
                      <Badge variant="destructive" className="text-[10px]">
                        用户标 disputed
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    priority {a.priority} · confidence {a.confidence.toFixed(2)} ·{' '}
                    {formatDate(a.created_at)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleEditAssertion(a.id, a.assertion_text)}
                  title="编辑"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleDeleteAssertion(a.id)}
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 2. observations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>老白观察 ({snapshot.observations.length} 条,显示最近 100)</span>
            <span className="text-xs text-muted-foreground font-normal">
              三类:realtime / fact_extracted / backfill
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {snapshot.observations.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">还没观察</div>
          ) : (
            snapshot.observations.map((o) => (
              <div
                key={o.id}
                className="flex items-start gap-2 py-2 px-3 hover:bg-muted/50 rounded text-sm"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{o.observation_text}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {o.observation_type.replace('laoke_realtime_observation', 'realtime')
                        .replace('fact_extracted_low_confidence', 'fact')
                        .replace('backfill_low_confidence', 'backfill')}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    confidence {o.confidence.toFixed(2)} · {formatDate(o.created_at)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleDeleteObservation(o.id)}
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 3. long_term_memory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>长期记忆摘要</span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={handleRegenerateLongTermMemory}
            >
              <RefreshCcw className="h-3.5 w-3.5 mr-1" /> 重生成
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {snapshot.long_term_memory ? (
            <div className="space-y-2 text-sm">
              <div className="text-xs text-muted-foreground">
                覆盖前 {snapshot.long_term_memory.covered_until_count} 条 ·{' '}
                {formatDate(snapshot.long_term_memory.updated_at)}
              </div>
              <div className="whitespace-pre-wrap text-sm bg-muted/50 p-3 rounded">
                {snapshot.long_term_memory.summary}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4">还没积累(对话不到 30 条)</div>
          )}
        </CardContent>
      </Card>

      {/* 4. language_fingerprint */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">用户语气指纹(跨关系)</CardTitle>
        </CardHeader>
        <CardContent>
          {snapshot.language_fingerprint ? (
            <div className="text-sm space-y-1.5">
              <div>
                句长:<span className="font-medium">{snapshot.language_fingerprint.message_length}</span>
                {' · '}
                正式度 {snapshot.language_fingerprint.formality}/100
                {' · '}
                情绪强度 {snapshot.language_fingerprint.emotionality}/100
                {' · '}
                {snapshot.language_fingerprint.uses_emoji ? '用 emoji' : '不爱 emoji'}
                {' · '}
                {snapshot.language_fingerprint.uses_period ? '用句号' : '不用句号'}
              </div>
              {snapshot.language_fingerprint.preferred_phrases.length > 0 && (
                <div>
                  常用短语:{snapshot.language_fingerprint.preferred_phrases.join(' / ')}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                样本 {snapshot.language_fingerprint.sample_count} 条 ·{' '}
                {formatDate(snapshot.language_fingerprint.updated_at)}
              </div>
              <div className="text-xs text-muted-foreground">M2 暂不支持编辑,M3 添加</div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4">
              还没积累(用户累计发消息要 ≥30 条才触发抽取)
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. 危险操作区 */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-base text-red-600">危险操作区</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            disabled={busy}
            className="border-red-300 text-red-600 hover:bg-red-50"
            onClick={handleClearAllProfile}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            清空所有画像数据
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            会软删除:所有 assertions + 所有 observations + 长期记忆缓存
            <br />
            不会动:messages 表(原始消息)、relationship 本身
            <br />
            ⚠ 用户原始消息保留下,Profile Updater 后续可能基于 messages 重新抽出 — 要永久清空请删 messages 或归档关系
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
