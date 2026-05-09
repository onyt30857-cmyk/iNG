'use client'

// 产品迭代记录(spec-022)
// Sam / 运营回顾"我们做了什么",防止"做过什么忘了"
// 关键功能:🪄 LLM 帮你从 git log 自动生成草稿

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  History,
  Plus,
  Sparkles,
  Edit2,
  Trash2,
  Filter,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { adminFetch, adminGet } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

type Category = 'feature' | 'improve' | 'fix' | 'remove' | 'breaking'
type Scope = 'user' | 'admin' | 'internal'

interface ChangelogItem {
  id: string
  date: string
  category: Category
  title: string
  description: string | null
  scope: Scope
  created_by: string
  created_at: string
}

interface ListResponse {
  items: ChangelogItem[]
  total: number
}

interface DraftEntry {
  date: string
  category: Category
  title: string
  description: string
  scope: Scope
  source_commits: string[]
}

const CATEGORY_LABEL: Record<Category, string> = {
  feature: '✨ 新功能',
  improve: '💡 优化',
  fix: '🛠️ 修复',
  remove: '🗑️ 移除',
  breaking: '⚠️ 重大变更',
}

const CATEGORY_COLOR: Record<Category, string> = {
  feature: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  improve: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  fix: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  remove: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  breaking: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

const SCOPE_LABEL: Record<Scope, string> = {
  user: '👤 用户',
  admin: '🛠️ 运营',
  internal: '⚙️ 内部',
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthKey(date: string): string {
  return date.slice(0, 7) // YYYY-MM
}

export default function ChangelogPage() {
  const [items, setItems] = useState<ChangelogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ChangelogItem | null>(null)
  const [draftOpen, setDraftOpen] = useState(false)
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all')
  const [filterScope, setFilterScope] = useState<Scope | 'all'>('all')

  async function load() {
    setLoading(true)
    const params: Record<string, string | number> = { pageSize: 200 }
    if (filterCategory !== 'all') params.category = filterCategory
    if (filterScope !== 'all') params.scope = filterScope
    const res = await adminGet<ListResponse>('/v1/admin/changelogs', params)
    setLoading(false)
    if (res.ok) {
      setItems(res.data.items)
      setErrorMsg(null)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  useEffect(() => {
    void load()
  }, [filterCategory, filterScope])

  // 按月份分组
  const grouped = useMemo(() => {
    const groups: Record<string, ChangelogItem[]> = {}
    for (const it of items) {
      const key = monthKey(it.date)
      groups[key] = groups[key] ?? []
      groups[key].push(it)
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [items])

  async function handleDelete(it: ChangelogItem) {
    if (!confirm(`删除"${it.title}"?`)) return
    const res = await adminFetch(`/v1/admin/changelogs/${it.id}`, { method: 'DELETE' })
    if (res.ok) {
      void load()
    } else {
      alert(`删除失败:${res.error.message}`)
    }
  }

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <History className="h-6 w-6" />
            产品迭代记录
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            我们做了什么 · 防止"做过的事忘了"
            {items.length > 0 && <span className="ml-2 text-muted-foreground/70">共 {items.length} 条</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setDraftOpen(true)} className="gap-1">
            <Sparkles className="h-4 w-4 text-purple-600" />
            🪄 生成草稿
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" />
            手动添加
          </Button>
        </div>
      </div>

      {/* 用法引导(轻量,折叠在小卡片里)*/}
      <Card>
        <CardContent className="py-3 text-xs text-muted-foreground space-y-1">
          <p>💡 <strong>怎么用</strong>:每周一点&ldquo;🪄 生成草稿&rdquo;,LLM 读上周 git commit 帮你浓缩成 5-10 条产品级条目,你 review 编辑后发布</p>
          <p>📌 不替代 git log(那是工程师的)/ 操作审计(那是运营操作),这里是<strong>产品迭代纪要</strong>(中文摘要,Sam / 投资人 / 团队回顾用)</p>
        </CardContent>
      </Card>

      {/* 过滤器 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as Category | 'all')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">所有类型</option>
          <option value="feature">✨ 新功能</option>
          <option value="improve">💡 优化</option>
          <option value="fix">🛠️ 修复</option>
          <option value="remove">🗑️ 移除</option>
          <option value="breaking">⚠️ 重大变更</option>
        </select>
        <select
          value={filterScope}
          onChange={(e) => setFilterScope(e.target.value as Scope | 'all')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">所有范围</option>
          <option value="user">👤 用户可见</option>
          <option value="admin">🛠️ 运营后台</option>
          <option value="internal">⚙️ 纯内部</option>
        </select>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {!loading && items.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-3">
            <p className="text-base">还没记录过任何迭代</p>
            <p>点&ldquo;🪄 生成草稿&rdquo;让 LLM 帮你从 git 里浓缩,或&ldquo;手动添加&rdquo;</p>
          </CardContent>
        </Card>
      )}

      {/* 按月份分组 */}
      <div className="space-y-6">
        {grouped.map(([month, list]) => (
          <MonthGroup
            key={month}
            month={month}
            items={list}
            onEdit={setEditing}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* 创建 modal */}
      <ChangelogFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false)
          void load()
        }}
      />

      {/* 编辑 modal */}
      {editing && (
        <ChangelogFormDialog
          open={true}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}

      {/* 🪄 生成草稿 modal */}
      <DraftDialog
        open={draftOpen}
        onClose={() => setDraftOpen(false)}
        onApplied={() => {
          setDraftOpen(false)
          void load()
        }}
      />
    </div>
  )
}

function MonthGroup({
  month,
  items,
  onEdit,
  onDelete,
}: {
  month: string
  items: ChangelogItem[]
  onEdit: (it: ChangelogItem) => void
  onDelete: (it: ChangelogItem) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {month} <span className="text-xs">({items.length} 条)</span>
      </button>
      {open && (
        <div className="space-y-2 pl-6">
          {items.map((it) => (
            <Card key={it.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${CATEGORY_COLOR[it.category]}`}>
                        {CATEGORY_LABEL[it.category]}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {SCOPE_LABEL[it.scope]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{it.date}</span>
                    </div>
                    <div className="font-medium">{it.title}</div>
                    {it.description && (
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {it.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(it)} className="h-8 w-8 p-0">
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(it)} className="h-8 w-8 p-0 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function ChangelogFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  initial?: ChangelogItem
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(initial?.date ?? todayStr())
  const [category, setCategory] = useState<Category>(initial?.category ?? 'feature')
  const [scope, setScope] = useState<Scope>(initial?.scope ?? 'user')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handle(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setErr('标题不能空')
      return
    }
    setSubmitting(true)
    setErr(null)
    const body = { date, category, scope, title: title.trim(), description: description.trim() || null }
    const res = initial
      ? await adminFetch(`/v1/admin/changelogs/${initial.id}`, { method: 'PATCH', body })
      : await adminFetch('/v1/admin/changelogs', { method: 'POST', body })
    setSubmitting(false)
    if (res.ok) {
      onSaved()
    } else {
      setErr(res.error.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? '编辑迭代记录' : '添加迭代记录'}</DialogTitle>
          <DialogDescription>
            一句话标题 + 1-2 句详情。运营 / 投资人 / 团队回顾时看
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handle} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="date">日期</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="category">类型</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="feature">✨ 新功能</option>
                <option value="improve">💡 优化</option>
                <option value="fix">🛠️ 修复</option>
                <option value="remove">🗑️ 移除</option>
                <option value="breaking">⚠️ 重大变更</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="scope">影响范围</Label>
            <select
              id="scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="user">👤 用户可见(主要)</option>
              <option value="admin">🛠️ 运营后台</option>
              <option value="internal">⚙️ 纯内部技术</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="title">标题(一句话,&lt; 30 字)</Label>
            <Input
              id="title"
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例:用户首次进入有完整账户创建流程"
              required
            />
            <p className="text-xs text-muted-foreground text-right">{title.length} / 100</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">详情(选填,1-2 句)</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="做了什么 / 为什么 / 给谁用"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? '保存中…' : initial ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DraftDialog({
  open,
  onClose,
  onApplied,
}: {
  open: boolean
  onClose: () => void
  onApplied: () => void
}) {
  const [windowDays, setWindowDays] = useState(7)
  const [drafts, setDrafts] = useState<DraftEntry[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [generated, setGenerated] = useState(false)
  const [commits, setCommits] = useState(0)

  async function generate() {
    setLoading(true)
    setErrorMsg(null)
    setSelected(new Set())
    const res = await adminGet<{ entries: DraftEntry[]; commits_analyzed: number }>(
      '/v1/admin/changelogs/draft',
      { windowDays },
    )
    setLoading(false)
    if (res.ok) {
      setDrafts(res.data.entries)
      setCommits(res.data.commits_analyzed)
      setGenerated(true)
      setSelected(new Set(res.data.entries.map((_, i) => i)))
    } else {
      setErrorMsg(res.error.message)
    }
  }

  async function applySelected() {
    if (selected.size === 0) return
    setApplying(true)
    setErrorMsg(null)
    const targets = drafts.filter((_, i) => selected.has(i))
    let successCount = 0
    for (const d of targets) {
      const res = await adminFetch('/v1/admin/changelogs', {
        method: 'POST',
        body: {
          date: d.date,
          category: d.category,
          title: d.title,
          description: d.description || null,
          scope: d.scope,
        },
      })
      if (res.ok) successCount++
    }
    setApplying(false)
    if (successCount === selected.size) {
      onApplied()
    } else {
      setErrorMsg(`成功 ${successCount} / ${targets.length} 条,部分失败`)
    }
  }

  function toggleEntry(i: number) {
    setSelected((s) => {
      const ns = new Set(s)
      if (ns.has(i)) ns.delete(i)
      else ns.add(i)
      return ns
    })
  }

  function updateEntry(i: number, patch: Partial<DraftEntry>) {
    setDrafts((d) => d.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setDrafts([])
          setGenerated(false)
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            🪄 LLM 帮你浓缩 git commit
          </DialogTitle>
          <DialogDescription>
            读过去 N 天的 git log,让 Haiku 帮你浓缩成产品级中文条目。你勾选 + 编辑后批量发布。
          </DialogDescription>
        </DialogHeader>

        {/* 时间窗口 + 生成按钮 */}
        {!generated && (
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="space-y-1 flex-1">
                <Label>从过去几天里浓缩?</Label>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={windowDays}
                  onChange={(e) => setWindowDays(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">默认 7 天 = 上周。月度回顾改 30。</p>
              </div>
              <Button onClick={generate} disabled={loading}>
                {loading ? '生成中…(~5s)' : '🪄 开始浓缩'}
              </Button>
            </div>
            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
          </div>
        )}

        {/* 草稿列表 */}
        {generated && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              读了 <strong>{commits}</strong> 个 commit · 浓缩出 <strong>{drafts.length}</strong> 条草稿 ·
              全选 <strong>{selected.size}</strong> 条将发布
            </div>

            {drafts.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                LLM 没浓缩出条目(可能 commit 太少 / 都是工程修复)
              </p>
            )}

            <div className="space-y-2">
              {drafts.map((d, i) => (
                <Card key={i} className={selected.has(i) ? 'border-primary' : ''}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggleEntry(i)}
                        className="mt-1 shrink-0"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={d.category}
                            onChange={(e) => updateEntry(i, { category: e.target.value as Category })}
                            className="h-7 text-xs rounded border border-input bg-background px-2"
                          >
                            <option value="feature">✨ 新功能</option>
                            <option value="improve">💡 优化</option>
                            <option value="fix">🛠️ 修复</option>
                            <option value="remove">🗑️ 移除</option>
                            <option value="breaking">⚠️ 重大变更</option>
                          </select>
                          <select
                            value={d.scope}
                            onChange={(e) => updateEntry(i, { scope: e.target.value as Scope })}
                            className="h-7 text-xs rounded border border-input bg-background px-2"
                          >
                            <option value="user">👤 用户</option>
                            <option value="admin">🛠️ 运营</option>
                            <option value="internal">⚙️ 内部</option>
                          </select>
                          <Input
                            type="date"
                            value={d.date}
                            onChange={(e) => updateEntry(i, { date: e.target.value })}
                            className="h-7 w-32 text-xs"
                          />
                        </div>
                        <Input
                          value={d.title}
                          onChange={(e) => updateEntry(i, { title: e.target.value })}
                          maxLength={100}
                          className="h-8"
                        />
                        <textarea
                          value={d.description}
                          onChange={(e) => updateEntry(i, { description: e.target.value })}
                          rows={2}
                          className="w-full text-xs rounded border border-input bg-background px-2 py-1"
                          placeholder="详情(可选)"
                        />
                        {d.source_commits.length > 0 && (
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer">基于 {d.source_commits.length} 个 commit</summary>
                            <ul className="mt-1 space-y-0.5 font-mono pl-3">
                              {d.source_commits.map((c, ci) => (
                                <li key={ci}>{c}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {generated ? '关掉(不发布)' : '取消'}
          </Button>
          {generated && drafts.length > 0 && (
            <>
              <Button type="button" variant="outline" onClick={generate}>
                🔄 重新生成
              </Button>
              <Button
                type="button"
                onClick={applySelected}
                disabled={applying || selected.size === 0}
              >
                {applying ? '发布中…' : `✓ 发布勾选的 ${selected.size} 条`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
