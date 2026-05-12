'use client'

// 老白档案页 v2(spec-026)— Hero + 4 Tab 架构
// Tab 1 人格(可编辑) / Tab 2 红线(可编辑/新增/删除/禁用) / Tab 3 AI 配置(只读) / Tab 4 修改历史

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Edit2,
  Plus,
  X as XIcon,
  Save,
  ShieldAlert,
  Cpu,
  AlertTriangle,
  ExternalLink,
  Heart,
  Eye,
  EyeOff,
  Camera,
  Trash2,
  RotateCcw,
  Power,
  History,
  User,
  Brain,
} from 'lucide-react'
import { adminFetch, adminGet } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LaokeAvatar } from '@/components/laoke/laoke-avatar'

interface Persona {
  id: string
  identity_summary: string
  age: number
  role: string
  signature_phrases: string[]
  forbidden_phrases: string[]
  judgment_style: string
  recognizes: string[]
  formatting_rules: string
  do_not_change_warnings: string | null
  avatar_url: string | null
  updated_at: string
}

interface RedLineRule {
  id: string
  category: string
  name: string
  description: string
  keyword_patterns: string[]
  refusal_reply: string
  enabled: boolean
  sort_order: number
  is_default: boolean
  updated_at: string
}

interface AiConfig {
  model: string
  scenes: Array<{ name: string; max_tokens: number; model: string; label: string }>
  temperature: string
  prompt_cache: string
}

interface AuditItem {
  id: string
  action: string
  target_type: string
  target_id: string
  reason: string | null
  admin_email: string | null
  created_at: string
}

type TabKey = 'persona' | 'red_lines' | 'ai_config' | 'audit'

export default function LaokePage() {
  const [persona, setPersona] = useState<Persona | null>(null)
  const [redLines, setRedLines] = useState<RedLineRule[]>([])
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null)
  const [audit, setAudit] = useState<AuditItem[]>([])
  const [tab, setTab] = useState<TabKey>('persona')
  const [loading, setLoading] = useState(true)

  async function loadAll() {
    setLoading(true)
    const [pRes, rRes, aRes, auRes] = await Promise.all([
      adminGet<Persona>('/v1/admin/laoke/persona'),
      adminGet<{ items: RedLineRule[] }>('/v1/admin/laoke/red-lines'),
      adminGet<AiConfig>('/v1/admin/laoke/ai-config'),
      adminGet<{ items: AuditItem[] }>('/v1/admin/laoke/audit'),
    ])
    setLoading(false)
    if (pRes.ok) setPersona(pRes.data)
    if (rRes.ok) setRedLines(rRes.data.items)
    if (aRes.ok) setAiConfig(aRes.data)
    if (auRes.ok) setAudit(auRes.data.items)
  }

  useEffect(() => {
    void loadAll()
  }, [])

  if (loading || !persona) {
    return <div className="container max-w-5xl py-8 text-sm text-muted-foreground">加载中…</div>
  }

  const enabledCount = redLines.filter((r) => r.enabled).length

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      {/* Hero — 老白形象卡(永久顶部)*/}
      <Hero persona={persona} onAvatarChanged={loadAll} />

      {/* 4 Tab 切换(M3.0 Item 1 拆 prompt 工程台后,删 '在用 Prompt' tab):人格 / 红线 / AI 配置 / 修改历史 */}
      <div className="border-b flex items-center gap-1 overflow-x-auto">
        <TabButton active={tab === 'persona'} onClick={() => setTab('persona')} icon={<User className="h-4 w-4" />}>
          人格
        </TabButton>
        <TabButton
          active={tab === 'red_lines'}
          onClick={() => setTab('red_lines')}
          icon={<ShieldAlert className="h-4 w-4" />}
          badge={`${enabledCount}/${redLines.length}`}
        >
          红线
        </TabButton>
        <TabButton active={tab === 'ai_config'} onClick={() => setTab('ai_config')} icon={<Cpu className="h-4 w-4" />}>
          AI 配置
        </TabButton>
        <TabButton active={tab === 'audit'} onClick={() => setTab('audit')} icon={<History className="h-4 w-4" />}>
          修改历史
        </TabButton>
      </div>

      {/* Tab 内容 */}
      {tab === 'persona' && <PersonaTab persona={persona} onSaved={loadAll} />}
      {tab === 'red_lines' && <RedLinesTab rules={redLines} onChanged={loadAll} />}
      {tab === 'ai_config' && aiConfig && <AiConfigTab config={aiConfig} />}
      {tab === 'audit' && <AuditTab items={audit} />}
    </div>
  )
}

// ============== Hero(永久顶部 + 头像上传) ==============

function Hero({ persona, onAvatarChanged }: { persona: Persona; onAvatarChanged: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState<'upload' | 'remove' | null>(null)
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function pickFile() {
    fileRef.current?.click()
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // reset input
    if (!file) return
    if (file.size > 1 * 1024 * 1024) {
      alert('图片太大,请压缩到 1MB 以内')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setPendingDataUrl(reader.result as string)
      setConfirming('upload')
    }
    reader.readAsDataURL(file)
  }

  async function confirmUpload() {
    if (!pendingDataUrl) return
    setUploading(true)
    const res = await adminFetch('/v1/admin/laoke/avatar', {
      method: 'POST',
      body: { data_url: pendingDataUrl },
    })
    setUploading(false)
    setConfirming(null)
    setPendingDataUrl(null)
    if (res.ok) {
      onAvatarChanged()
    } else {
      alert(`上传失败:${res.error.message}`)
    }
  }

  async function confirmRemove() {
    setUploading(true)
    const res = await adminFetch('/v1/admin/laoke/avatar', { method: 'DELETE' })
    setUploading(false)
    setConfirming(null)
    if (res.ok) {
      onAvatarChanged()
    } else {
      alert(`移除失败:${res.error.message}`)
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-4 sm:gap-6">
          {/* 头像 + 上传按钮 */}
          <div className="relative group shrink-0">
            {persona.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={persona.avatar_url}
                alt="老白头像"
                className="w-[120px] h-[120px] rounded-full object-cover border-4 border-white shadow"
              />
            ) : (
              <LaokeAvatar size={120} />
            )}
            <button
              type="button"
              onClick={pickFile}
              disabled={uploading}
              className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 shadow-md"
              title="上传新头像"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={onFileChosen}
            />
          </div>

          <div className="flex-1 min-w-0 w-full space-y-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold">老白</h1>
              <p className="text-sm text-muted-foreground mt-1.5 break-words">
                <span>{persona.role}</span>
                <span className="mx-2 text-muted-foreground/40">·</span>
                <span>{persona.age} 岁</span>
                <span className="mx-2 text-muted-foreground/40">·</span>
                <span>练爱产品的 AI 兄长</span>
                {persona.avatar_url && (
                  <button
                    onClick={() => setConfirming('remove')}
                    className="ml-2 text-xs text-destructive hover:underline whitespace-nowrap"
                  >
                    移除头像
                  </button>
                )}
              </p>
            </div>
            <p className="text-sm leading-relaxed break-words">{persona.identity_summary}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-2 pt-2 justify-center sm:justify-start">
              <Link href="/prompts" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                改老白说话方式 <ExternalLink className="h-3 w-3" />
              </Link>
              <Link href="/moderation-logs" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                红线触发记录 <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* 改 prompt 警示 */}
        {persona.do_not_change_warnings && (
          <div className="mt-5 rounded-md border border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 p-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs whitespace-pre-wrap flex-1">{persona.do_not_change_warnings}</div>
          </div>
        )}
      </CardContent>

      {/* 上传/移除 确认 */}
      <Dialog open={!!confirming} onOpenChange={(v) => !v && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirming === 'upload' ? '确认换老白头像?' : '确认移除老白头像?'}
            </DialogTitle>
            <DialogDescription>
              ⚠️ 这会**全局生效** — 所有用户立刻看到新头像。请确认图片合适。
            </DialogDescription>
          </DialogHeader>
          {confirming === 'upload' && pendingDataUrl && (
            <div className="flex justify-center py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingDataUrl} alt="预览" className="w-32 h-32 rounded-full object-cover" />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={uploading}>
              取消
            </Button>
            <Button
              onClick={confirming === 'upload' ? confirmUpload : confirmRemove}
              disabled={uploading}
            >
              {uploading ? '处理中…' : confirming === 'upload' ? '确认上传' : '确认移除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function TabButton({
  active,
  onClick,
  children,
  icon,
  badge,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon?: React.ReactNode
  badge?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm flex items-center gap-2 border-b-2 transition-colors ${
        active
          ? 'border-primary text-foreground font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {children}
      {badge && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{badge}</span>
      )}
    </button>
  )
}

// ============== Tab 1 人格 ==============

function PersonaTab({ persona, onSaved }: { persona: Persona; onSaved: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <PhraseListCard
          title="常说的话"
          subtitle="老白的说话特征"
          color="emerald"
          phrases={persona.signature_phrases}
          field="signature_phrases"
          emptyHint="还没定义"
          onSaved={onSaved}
        />
        <PhraseListCard
          title="绝不说的话"
          subtitle="改 prompt 时也不能让老白说这些"
          color="red"
          phrases={persona.forbidden_phrases}
          field="forbidden_phrases"
          emptyHint="还没定义"
          onSaved={onSaved}
        />
      </div>
      <PhraseListCard
        title="能识别的"
        subtitle="老白能从用户话里看出来的模式"
        color="blue"
        phrases={persona.recognizes}
        field="recognizes"
        emptyHint="还没定义"
        onSaved={onSaved}
      />
      <MarkdownCard title="判断风格" icon={<Heart className="h-4 w-4" />} content={persona.judgment_style} field="judgment_style" onSaved={onSaved} />
      <MarkdownCard
        title="话术硬约束"
        icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
        content={persona.formatting_rules}
        field="formatting_rules"
        onSaved={onSaved}
      />
      <MarkdownCard
        title="身份介绍"
        content={persona.identity_summary}
        field="identity_summary"
        onSaved={onSaved}
      />
    </div>
  )
}

// ============== Tab 2 红线 ==============

function RedLinesTab({ rules, onChanged }: { rules: RedLineRule[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<RedLineRule | null>(null)
  const [creating, setCreating] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function toggleEnabled(r: RedLineRule) {
    const res = await adminFetch(`/v1/admin/laoke/red-lines/${r.id}`, {
      method: 'PATCH',
      body: { enabled: !r.enabled },
    })
    if (res.ok) onChanged()
    else alert(res.error.message)
  }

  async function deleteRule(r: RedLineRule) {
    if (!confirm(`删除 "${r.name}"?默认规则不能删,只能停用`)) return
    const res = await adminFetch(`/v1/admin/laoke/red-lines/${r.id}`, { method: 'DELETE' })
    if (res.ok) onChanged()
    else alert(res.error.message)
  }

  async function resetDefaults() {
    if (!confirm('重置 9 条默认规则到 seed 状态?会覆盖之前对默认规则的所有修改(自定义规则不受影响)')) return
    setResetting(true)
    const res = await adminFetch('/v1/admin/laoke/red-lines/reset-defaults', { method: 'POST' })
    setResetting(false)
    if (res.ok) onChanged()
    else alert(res.error.message)
  }

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/10">
        <CardContent className="py-3 text-xs text-muted-foreground space-y-1">
          <p>📌 红线触发时,老白**不再回应,直接返回拒绝文案** + 落 moderation_logs</p>
          <p>📌 关键词用<strong>正则表达式</strong>(JS 风格,不区分大小写)。例 <code>(约炮|一夜情)</code></p>
          <p>📌 默认 9 条不能删,只能"停用"。自定义新增的可任意删</p>
          <p>📌 改了立即生效(进程内 cache 自动 invalidate)</p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          共 <strong className="text-foreground">{rules.length}</strong> 条规则,启用 <strong className="text-emerald-600">{rules.filter((r) => r.enabled).length}</strong> 条
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetDefaults} disabled={resetting} className="gap-1">
            <RotateCcw className="h-3.5 w-3.5" />
            重置默认 9 条
          </Button>
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            新增红线
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {rules.map((r) => (
          <RedLineCard
            key={r.id}
            rule={r}
            onEdit={() => setEditing(r)}
            onToggle={() => toggleEnabled(r)}
            onDelete={() => deleteRule(r)}
          />
        ))}
      </div>

      {editing && (
        <RedLineEditDialog
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged()
          }}
        />
      )}
      {creating && (
        <RedLineEditDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function RedLineCard({
  rule,
  onEdit,
  onToggle,
  onDelete,
}: {
  rule: RedLineRule
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const [showRefusal, setShowRefusal] = useState(false)
  return (
    <Card className={!rule.enabled ? 'opacity-60' : ''}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={rule.enabled ? 'destructive' : 'muted'} className="font-mono text-[10px]">
                {rule.category}
              </Badge>
              <span className="font-medium">{rule.name}</span>
              {!rule.enabled && <Badge variant="muted" className="text-[10px]">已停用</Badge>}
              {rule.is_default ? (
                <Badge variant="outline" className="text-[10px]">默认</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">自定义</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
            {rule.keyword_patterns.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {rule.keyword_patterns.slice(0, 3).map((p, i) => (
                  <code key={i} className="text-[10px] px-1.5 py-0.5 bg-muted rounded font-mono">
                    {p.length > 30 ? p.slice(0, 30) + '…' : p}
                  </code>
                ))}
                {rule.keyword_patterns.length > 3 && (
                  <span className="text-[10px] text-muted-foreground self-center">+{rule.keyword_patterns.length - 3}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setShowRefusal(!showRefusal)} className="gap-1">
              {showRefusal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={onToggle} className={rule.enabled ? 'text-amber-600' : 'text-emerald-600'}>
              <Power className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            {!rule.is_default && (
              <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        {showRefusal && (
          <div className="bg-muted/50 rounded p-3 text-xs whitespace-pre-wrap border-l-2 border-blue-400">
            <div className="text-[10px] text-muted-foreground mb-1">老白的拒绝文案:</div>
            {rule.refusal_reply}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RedLineEditDialog({
  rule,
  onClose,
  onSaved,
}: {
  rule?: RedLineRule
  onClose: () => void
  onSaved: () => void
}) {
  const isCreate = !rule
  const [category, setCategory] = useState(rule?.category ?? '')
  const [name, setName] = useState(rule?.name ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [patterns, setPatterns] = useState<string[]>(rule?.keyword_patterns ?? [])
  const [refusal, setRefusal] = useState(rule?.refusal_reply ?? '')
  const [sortOrder, setSortOrder] = useState(rule?.sort_order ?? 100)
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  // 校验所有 regex 合法
  const invalidPatterns = useMemo(() => {
    return patterns
      .map((p, i) => ({ i, p, ok: tryRegex(p) }))
      .filter((x) => !x.ok && x.p.trim().length > 0)
  }, [patterns])

  function tryRegex(p: string): boolean {
    try {
      new RegExp(p)
      return true
    } catch {
      return false
    }
  }

  async function submit() {
    setErrMsg(null)
    if (!name.trim() || !description.trim() || !refusal.trim()) {
      setErrMsg('名称 / 描述 / 拒绝文案都必填')
      return
    }
    if (invalidPatterns.length > 0) {
      setErrMsg('有非法正则,改了再保存')
      return
    }
    const cleanedPatterns = patterns.filter((p) => p.trim())
    setSubmitting(true)
    const body: Record<string, unknown> = {
      name,
      description,
      keyword_patterns: cleanedPatterns,
      refusal_reply: refusal,
      sort_order: sortOrder,
    }
    let res
    if (isCreate) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(category)) {
        setSubmitting(false)
        setErrMsg('category 必须 UPPER_SNAKE_CASE')
        return
      }
      body.category = category
      res = await adminFetch('/v1/admin/laoke/red-lines', { method: 'POST', body })
    } else {
      res = await adminFetch(`/v1/admin/laoke/red-lines/${rule!.id}`, { method: 'PATCH', body })
    }
    setSubmitting(false)
    if (res.ok) onSaved()
    else setErrMsg(res.error.message)
  }

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isCreate ? '新增红线规则' : `编辑 ${rule!.name}`}</DialogTitle>
          <DialogDescription>
            改了立即生效(全局 cache invalidate)。{rule?.is_default && '⚠️ 这是默认规则,建议谨慎修改'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isCreate && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Category(UPPER_SNAKE,创建后不可改)</label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value.toUpperCase())}
                placeholder="如 NEW_RULE_NAME"
                maxLength={50}
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-sm font-medium">中文名</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="如 性目的话术" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">描述(给运营看)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={2}
              className="w-full text-sm rounded-md border border-input bg-background px-3 py-2"
              placeholder="一两句话说明这是什么规则"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">关键词(正则,会即时校验)</label>
            <div className="space-y-2">
              {patterns.map((p, i) => {
                const valid = tryRegex(p) || p.trim() === ''
                return (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={p}
                      onChange={(e) => {
                        const next = [...patterns]
                        next[i] = e.target.value
                        setPatterns(next)
                      }}
                      className={`font-mono text-xs ${!valid ? 'border-destructive' : ''}`}
                      placeholder="如 (约炮|一夜情)"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPatterns(patterns.filter((_, idx) => idx !== i))}
                      className="text-destructive shrink-0"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
              <Button variant="outline" size="sm" onClick={() => setPatterns([...patterns, ''])} className="gap-1">
                <Plus className="h-3.5 w-3.5" />
                加一条 regex
              </Button>
            </div>
            {invalidPatterns.length > 0 && (
              <p className="text-xs text-destructive">⚠️ 有 {invalidPatterns.length} 条非法正则</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">拒绝文案(老白说给用户的)</label>
            <textarea
              value={refusal}
              onChange={(e) => setRefusal(e.target.value)}
              maxLength={5000}
              rows={6}
              className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 font-mono"
              placeholder="支持 \n 换行 / **markdown 加粗**(纯文本展示)"
            />
            <p className="text-xs text-muted-foreground">📌 用老白人格写,符合"绝不说的话"清单</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">排序权重</label>
            <Input
              type="number"
              min={0}
              max={9999}
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">越小越靠前。默认 100</p>
          </div>

          {errMsg && <p className="text-sm text-destructive">{errMsg}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={submit} disabled={submitting} className="gap-1">
            <Save className="h-3.5 w-3.5" />
            {submitting ? '保存中…' : isCreate ? '新增' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============== Tab 3 AI 配置 ==============

function AiConfigTab({ config }: { config: AiConfig }) {
  return (
    <Card>
      <CardContent className="p-5 space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">主模型</div>
            <div className="font-mono break-all">{config.model}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">temperature</div>
            <div>{config.temperature}</div>
          </div>
        </div>
        <div className="border-t pt-3">
          <div className="text-xs text-muted-foreground mb-2">各场景参数</div>
          <div className="space-y-1">
            {config.scenes.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-2 flex-wrap py-1 text-xs">
                <span className="min-w-0">
                  <Badge variant="outline" className="font-mono mr-2">
                    {s.name}
                  </Badge>
                  {s.label}
                </span>
                <span className="text-muted-foreground">
                  <span className="font-mono">{s.model.replace('claude-', '')}</span>
                  <span className="mx-2">·</span>
                  max_tokens={s.max_tokens}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">⚙️ {config.prompt_cache}</div>
        <div className="text-xs text-muted-foreground border-t pt-3 mt-3">
          📌 这些参数代码里硬控,不能在 admin 改。需要改请提需求给工程师调。
        </div>
      </CardContent>
    </Card>
  )
}

// ============== Tab 4 修改历史 ==============

function AuditTab({ items }: { items: AuditItem[] }) {
  const ACTION_LABEL: Record<string, string> = {
    update_laoke_persona: '改了人格档案',
    update_laoke_avatar: '🖼️ 换了头像',
    remove_laoke_avatar: '🗑️ 移除头像',
    create_red_line: '🆕 新增红线',
    update_red_line: '✏️ 改了红线',
    delete_red_line: '🗑️ 删了红线',
    reset_red_line_defaults: '🔄 重置 9 条默认',
  }

  return (
    <Card>
      <CardContent className="p-5">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">还没有人改过老白的设置</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-start gap-3 text-sm py-2 border-b last:border-0">
                <span className="text-xs text-muted-foreground shrink-0 w-32 tabular-nums">
                  {new Date(it.created_at).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {it.admin_email?.split('@')[0] ?? 'unknown'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{ACTION_LABEL[it.action] ?? it.action}</div>
                  {it.reason && <div className="text-xs text-muted-foreground mt-0.5">{it.reason}</div>}
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                  {it.target_type === 'laoke_persona' ? '人格' : '红线'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============== 通用编辑组件 ==============

function PhraseListCard({
  title,
  subtitle,
  color,
  phrases,
  field,
  emptyHint,
  onSaved,
}: {
  title: string
  subtitle?: string
  color: 'emerald' | 'red' | 'blue'
  phrases: string[]
  field: string
  emptyHint: string
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [items, setItems] = useState<string[]>(phrases)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) setItems(phrases)
  }, [phrases, editing])

  const colorMap = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  }

  async function save() {
    setSaving(true)
    const res = await adminFetch(`/v1/admin/laoke/persona`, {
      method: 'PATCH',
      body: { [field]: items.filter((s) => s.trim()) },
    })
    setSaving(false)
    if (res.ok) {
      setEditing(false)
      onSaved()
    } else {
      alert(`保存失败:${res.error.message}`)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>
            {title}
            {subtitle && <span className="ml-2 text-xs font-normal text-muted-foreground">{subtitle}</span>}
          </span>
          {!editing ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                取消
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                <Save className="h-3.5 w-3.5 mr-1" />
                {saving ? '保存中…' : '保存'}
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!editing ? (
          phrases.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">{emptyHint}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {phrases.map((p, i) => (
                <span key={i} className={`text-sm px-2.5 py-1 rounded-md ${colorMap[color]}`}>
                  {p}
                </span>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-2">
            {items.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={p}
                  onChange={(e) => {
                    const next = [...items]
                    next[i] = e.target.value
                    setItems(next)
                  }}
                  maxLength={100}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                  className="text-destructive shrink-0"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setItems([...items, ''])} className="gap-1 mt-2">
              <Plus className="h-3.5 w-3.5" />
              加一条
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MarkdownCard({
  title,
  icon,
  content,
  field,
  onSaved,
}: {
  title: string
  icon?: React.ReactNode
  content: string
  field: string
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(content)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) setText(content)
  }, [content, editing])

  async function save() {
    setSaving(true)
    const res = await adminFetch(`/v1/admin/laoke/persona`, {
      method: 'PATCH',
      body: { [field]: text },
    })
    setSaving(false)
    if (res.ok) {
      setEditing(false)
      onSaved()
    } else {
      alert(`保存失败:${res.error.message}`)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
          {!editing ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                取消
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!editing ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{content}</div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.max(8, text.split('\n').length + 1)}
            maxLength={5000}
            className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 font-mono"
          />
        )}
      </CardContent>
    </Card>
  )
}
