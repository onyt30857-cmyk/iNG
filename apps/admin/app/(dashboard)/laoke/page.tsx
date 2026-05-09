'use client'

// 老白档案页(spec-025)— P0-1 + P0-3 + P1-5 + 形象 + 编辑器
//
// 5 个 section:
// 1. 老白形象卡(SVG 头像 + 身份 chips)
// 2. 说话风格(常说 / 禁说,可编辑)
// 3. 判断风格 + 能识别(可编辑)
// 4. 话术硬约束(可编辑)
// 5. 7 条红线(只读)
// 6. AI 配置(只读)
// 7. 改 prompt 警示(只读)

import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { adminFetch, adminGet } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  updated_by: string | null
  updated_at: string
}

interface RedLine {
  category: string
  name: string
  desc: string
  refusal_reply: string
}

interface AiConfig {
  model: string
  scenes: Array<{ name: string; max_tokens: number; model: string; label: string }>
  temperature: string
  prompt_cache: string
}

export default function LaokePage() {
  const [persona, setPersona] = useState<Persona | null>(null)
  const [redLines, setRedLines] = useState<RedLine[]>([])
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [pRes, rRes, aRes] = await Promise.all([
      adminGet<Persona>('/v1/admin/laoke/persona'),
      adminGet<{ items: RedLine[] }>('/v1/admin/laoke/red-lines'),
      adminGet<AiConfig>('/v1/admin/laoke/ai-config'),
    ])
    setLoading(false)
    if (pRes.ok) setPersona(pRes.data)
    if (rRes.ok) setRedLines(rRes.data.items)
    if (aRes.ok) setAiConfig(aRes.data)
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading || !persona) {
    return <div className="container max-w-5xl py-8 text-sm text-muted-foreground">加载中…</div>
  }

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      {/* Hero — 老白形象卡 */}
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start gap-6 flex-wrap">
            <LaokeAvatar size={120} />
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <h1 className="text-3xl font-semibold flex items-center gap-3">
                  老白
                  <Badge variant="outline" className="text-sm font-normal">
                    {persona.role}
                  </Badge>
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {persona.age} 岁 · 练爱产品的 AI 兄长 · 上次改人格:
                  {new Date(persona.updated_at).toLocaleString('zh-CN')}
                </p>
              </div>
              <p className="text-sm leading-relaxed">{persona.identity_summary}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Link href="/prompts" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                  改老白说话方式 <ExternalLink className="h-3 w-3" />
                </Link>
                <Link href="/moderation-logs" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                  红线触发记录 <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 改 prompt 警示 */}
      {persona.do_not_change_warnings && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1 text-sm whitespace-pre-wrap">
              {persona.do_not_change_warnings}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 说话风格(双列编辑器) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PhraseListCard
          title="常说的话(老白特征)"
          color="emerald"
          phrases={persona.signature_phrases}
          field="signature_phrases"
          emptyHint="老白还没定下来怎么说话"
          onSaved={load}
        />
        <PhraseListCard
          title="绝不说的话(老白红线)"
          color="red"
          phrases={persona.forbidden_phrases}
          field="forbidden_phrases"
          emptyHint="还没列出忌讳的话"
          onSaved={load}
        />
      </div>

      {/* 判断风格 */}
      <MarkdownCard
        title="判断风格"
        icon={<Heart className="h-4 w-4" />}
        content={persona.judgment_style}
        field="judgment_style"
        onSaved={load}
      />

      {/* 能识别 */}
      <PhraseListCard
        title="能识别的"
        subtitle="老白能从用户话里看出来的模式"
        color="blue"
        phrases={persona.recognizes}
        field="recognizes"
        emptyHint="还没定义能识别什么"
        onSaved={load}
      />

      {/* 话术硬约束 */}
      <MarkdownCard
        title="话术硬约束(改 prompt 时不能违反)"
        icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
        content={persona.formatting_rules}
        field="formatting_rules"
        onSaved={load}
      />

      {/* 7 条红线 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-600" />
            7 条红线(碰一次立刻拒绝 + 落 moderation_logs)
            <Link href="/moderation-logs" className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              看触发记录 <ExternalLink className="h-3 w-3" />
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {redLines.map((rl) => (
              <RedLineRow key={rl.category} item={rl} />
            ))}
          </div>
          <div className="text-xs text-muted-foreground pt-3 mt-3 border-t">
            📌 红线由代码硬控,改不了。要新增/调整请提需求给工程师改 red-line-guard.ts
          </div>
        </CardContent>
      </Card>

      {/* AI 配置 */}
      {aiConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              AI 配置(只读)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">主模型</div>
                <div className="font-mono">{aiConfig.model}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">temperature</div>
                <div>{aiConfig.temperature}</div>
              </div>
            </div>
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground mb-2">各场景参数</div>
              <div className="space-y-1">
                {aiConfig.scenes.map((s) => (
                  <div key={s.name} className="flex items-center justify-between py-1 text-xs">
                    <span>
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
            <div className="text-xs text-muted-foreground">⚙️ {aiConfig.prompt_cache}</div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============== 短语列表卡(可编辑数组)==============

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
                <span
                  key={i}
                  className={`text-sm px-2.5 py-1 rounded-md ${colorMap[color]}`}
                >
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setItems([...items, ''])}
              className="gap-1 mt-2"
            >
              <Plus className="h-3.5 w-3.5" />
              加一条
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============== Markdown 文本卡(可编辑)==============

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

// ============== 红线行(展开看 refusal)==============

function RedLineRow({ item }: { item: RedLine }) {
  const [showRefusal, setShowRefusal] = useState(false)
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="destructive" className="font-mono text-[10px]">
              {item.category}
            </Badge>
            <span className="font-medium">{item.name}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowRefusal(!showRefusal)}
          className="shrink-0"
        >
          {showRefusal ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
          {showRefusal ? '收起' : '看拒绝文案'}
        </Button>
      </div>
      {showRefusal && (
        <div className="bg-muted/50 rounded p-3 text-xs whitespace-pre-wrap font-mono">
          {item.refusal_reply}
        </div>
      )}
    </div>
  )
}
