'use client'

import { AlertCircle, Search, Activity, BookOpen, RefreshCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { adminGet } from '@/lib/api-client'
import { formatRelative } from '@/lib/format'

// 错误码字典(spec-020)+ 实时错误流(2026-05-10)
// ⚠️ 修改字典时同步改 apps/mobile/utils/error-codes.ts 的 ERROR_DICT
// 字典:静态 hardcode,工程决策,不需要运营改
// 实时流:从 client_error_logs 表读 mobile 上报的真实失败

interface ErrorEntry {
  code: string
  user_message: string
  internal_description: string
  troubleshoot: string
  category: '网络' | '鉴权' | '配额' | '内容' | 'AI' | '系统' | '其他'
}

const ERRORS: ErrorEntry[] = [
  {
    code: 'NW01',
    user_message: '网断了一下,你刷新一下试试',
    internal_description: '前端 fetch / uni.request 网络层失败(无 HTTP 响应)',
    troubleshoot:
      '检查用户手机是否切换网络;Railway 后端是否在线(curl /health);是否 CORS preflight 失败',
    category: '网络',
  },
  {
    code: 'NW02',
    user_message: '等响应等久了,可能在路上,稍等一下',
    internal_description: '请求超时(>15s 无响应)',
    troubleshoot:
      '查 ai_call_logs 那段时间的 duration_ms;Anthropic 是否慢;是否大 prompt',
    category: '网络',
  },
  {
    code: 'AU01',
    user_message: '账号信息过期了,系统正在帮你重新登',
    internal_description: 'access token 过期,silent reauth 自动触发中',
    troubleshoot: '正常情况会自动恢复;如果连续报 = refresh_token 也过期 → 看 AU02',
    category: '鉴权',
  },
  {
    code: 'AU02',
    user_message: '账号失联了,你点一下"用备份码恢复账户"',
    internal_description: 'refresh_token 也失效,无法 silent reauth',
    troubleshoot: '让用户去"我的"页用备份码恢复;或重新匿名注册(失去原账户数据)',
    category: '鉴权',
  },
  {
    code: 'QU01',
    user_message: '今天的积分用完了,明早 0 点重置',
    internal_description: '免费用户每日积分上限达到(spec-019)',
    troubleshoot:
      '查 daily_usage 表对应用户当日 points_used;如果是异常(用得太快)看 ai_call_logs 是否被刷',
    category: '配额',
  },
  {
    code: 'RL01',
    user_message: '这个老白没法接,你换个角度说说',
    internal_description: '红线触发(NSFW / PUA / 跟踪辅助等 7 类)',
    troubleshoot:
      '查 moderation_logs 该用户的 category 字段;持续触发 → tag red_line_hit',
    category: '内容',
  },
  {
    code: 'AI01',
    user_message: '老白这次没接住,你重发一下',
    internal_description: 'AI 调用失败(Anthropic 500 / 余额不足 / SDK 错)',
    troubleshoot:
      '查 ai_call_logs error_message;看 /settings/billing 余额是否足;Anthropic status 页',
    category: 'AI',
  },
  {
    code: 'SV01',
    user_message: '系统抽了下风,等会儿再来',
    internal_description: '后端 500 internal error(未分类异常)',
    troubleshoot: 'Sentry 看堆栈;Railway logs 那段时间的报错',
    category: '系统',
  },
  {
    code: 'PM01',
    user_message: '这个你没权限,可能是别人的关系',
    internal_description: '403 权限不足(多关系隔离 / 别人的数据)',
    troubleshoot:
      '检查 relationship_id 的 user_id 是否匹配 token user_id;前端是否传错',
    category: '鉴权',
  },
  {
    code: 'NETWORK_ERROR',
    user_message: '网线在打盹,你看看 wifi',
    internal_description: 'mobile uni.request 网络层失败,fail() callback 触发',
    troubleshoot: '看 client_error_logs ua/url 字段;同 IP 是否大量;Railway 后端是否慢',
    category: '网络',
  },
  {
    code: 'NETWORK_TIMEOUT',
    user_message: '等响应等久了,可能在路上',
    internal_description: 'mobile uni.request 超时(15s 阈值)',
    troubleshoot: '看是哪个 path 慢;Anthropic / DB / Supabase 是否慢',
    category: '网络',
  },
  {
    code: 'GLOBAL_ERROR',
    user_message: '(用户不可见,框架级错误后台静默上报)',
    internal_description: 'mobile App.vue window.error 全局未捕获错误',
    troubleshoot: '看 detail 字段堆栈;通常是 vendor bundle 加载失败 / vue 组件 throw',
    category: '系统',
  },
  {
    code: 'UNHANDLED_REJECTION',
    user_message: '(用户不可见,框架级错误后台静默上报)',
    internal_description: 'mobile App.vue unhandledrejection 全局未捕获 promise 拒绝',
    troubleshoot: '看 detail 字段堆栈;通常是 await 没 try-catch 导致',
    category: '系统',
  },
  {
    code: 'UN01',
    user_message: '出了个没见过的错,系统记下了正在查',
    internal_description: '未分类错误,fallback',
    troubleshoot: '看 Sentry 该时间点的 unhandled error;补充到 ERROR_DICT',
    category: '其他',
  },
]

const CATEGORY_COLOR: Record<ErrorEntry['category'], string> = {
  网络: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  鉴权: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  配额: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  内容: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  AI: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  系统: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  其他: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

type TabKey = 'dict' | 'live'

export default function ErrorsPage() {
  const [tab, setTab] = useState<TabKey>('dict')

  return (
    <div className="container max-w-6xl space-y-5 py-6 sm:py-8">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <AlertCircle className="h-5 w-5" /> 错误监控
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          字典查代号含义 + 实时流看真实用户在哪报错
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b flex items-center gap-1 overflow-x-auto">
        <TabButton active={tab === 'dict'} onClick={() => setTab('dict')} icon={<BookOpen className="h-4 w-4" />}>
          错误码字典
        </TabButton>
        <TabButton active={tab === 'live'} onClick={() => setTab('live')} icon={<Activity className="h-4 w-4" />}>
          实时错误流
        </TabButton>
      </div>

      {tab === 'dict' && <DictTab />}
      {tab === 'live' && <LiveTab />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon?: React.ReactNode
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
    </button>
  )
}

// ============== Tab 1: 字典 ==============

function DictTab() {
  const [search, setSearch] = useState('')
  const filtered = ERRORS.filter((e) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      e.code.toLowerCase().includes(q) ||
      e.user_message.toLowerCase().includes(q) ||
      e.internal_description.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="搜代号 / 用户文案 / 内部描述"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">共 {filtered.length} / {ERRORS.length} 条</p>

      <div className="space-y-3">
        {filtered.map((e) => (
          <Card key={e.code}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono font-semibold text-base">{e.code}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLOR[e.category]}`}>
                  {e.category}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">👤 用户看到</div>
                  <div className="text-sm">&ldquo;{e.user_message}&rdquo;</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">⚙️ 内部含义</div>
                  <div className="text-sm">{e.internal_description}</div>
                </div>
              </div>
              <div className="border-t pt-3">
                <div className="text-xs text-muted-foreground mb-1">🔍 排查思路</div>
                <div className="text-sm text-muted-foreground">{e.troubleshoot}</div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-12">没找到匹配的错误码</p>
        )}
      </div>
    </div>
  )
}

// ============== Tab 2: 实时错误流 ==============

interface ClientErrorRow {
  id: string
  user_id: string | null
  path: string
  method: string
  code: string
  message: string
  detail: string | null
  ua: string | null
  url: string | null
  ip: string | null
  created_at: string
}

interface AggregateData {
  window_hours: number
  total: number
  affected_users: number
  by_code: Array<{ code: string; count: number }>
}

function LiveTab() {
  const [aggregate, setAggregate] = useState<AggregateData | null>(null)
  const [items, setItems] = useState<ClientErrorRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [filterCode, setFilterCode] = useState('')
  const [search, setSearch] = useState('')
  const [windowHours, setWindowHours] = useState(24)
  const PAGE_SIZE = 50

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterCode) params.set('code', filterCode)
    if (search.trim()) params.set('search', search.trim())
    const since = new Date(Date.now() - windowHours * 3_600_000).toISOString()
    params.set('since', since)
    params.set('pageSize', String(PAGE_SIZE))

    const [aggRes, listRes] = await Promise.all([
      adminGet<AggregateData>(`/v1/admin/client-errors/aggregate?windowHours=${windowHours}`),
      adminGet<{ items: ClientErrorRow[]; total: number }>(`/v1/admin/client-errors?${params.toString()}`),
    ])
    setLoading(false)
    if (aggRes.ok) setAggregate(aggRes.data)
    if (listRes.ok) {
      setItems(listRes.data.items)
      setTotal(listRes.data.total)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCode, windowHours])

  return (
    <div className="space-y-4">
      {/* 聚合概览 */}
      {aggregate && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm font-medium">过去 {aggregate.window_hours} 小时</div>
              <div className="flex items-center gap-2">
                <select
                  value={windowHours}
                  onChange={(e) => setWindowHours(Number(e.target.value))}
                  className="h-8 text-xs rounded-md border bg-background px-2"
                >
                  <option value={1}>1 小时</option>
                  <option value={24}>24 小时</option>
                  <option value={168}>7 天</option>
                  <option value={720}>30 天</option>
                </select>
                <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1">
                  <RefreshCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                  刷新
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiBox label="总错误数" value={aggregate.total} tone={aggregate.total > 100 ? 'warn' : 'ok'} />
              <KpiBox label="受影响用户" value={aggregate.affected_users} tone={aggregate.affected_users > 10 ? 'warn' : 'ok'} />
              <KpiBox label="错误类型" value={aggregate.by_code.length} tone="ok" />
            </div>
            {aggregate.by_code.length > 0 && (
              <div className="border-t pt-3 space-y-1.5">
                <div className="text-xs text-muted-foreground">按 code 分布(点击筛选)</div>
                <div className="flex flex-wrap gap-1.5">
                  {aggregate.by_code.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => setFilterCode(filterCode === c.code ? '' : c.code)}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono border transition-colors ${
                        filterCode === c.code
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted/50'
                      }`}
                    >
                      <span>{c.code}</span>
                      <span className="text-[10px] opacity-70">{c.count}</span>
                    </button>
                  ))}
                  {filterCode && (
                    <button
                      onClick={() => setFilterCode('')}
                      className="text-xs text-muted-foreground hover:text-foreground underline px-2"
                    >
                      清掉筛选
                    </button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 搜索 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="搜 message / path / user_id 前缀"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') load()
            }}
          />
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          搜索
        </Button>
      </div>

      {/* 错误列表 */}
      <Card>
        <CardContent className="p-0">
          {loading && items.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">加载中…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground p-12 text-center">
              ✨ 没有错误,系统挺稳
            </p>
          ) : (
            <div className="divide-y">
              {items.map((it) => (
                <ErrorRow key={it.id} row={it} onCodeClick={(c) => setFilterCode(c)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {total > items.length && (
        <p className="text-center text-xs text-muted-foreground">
          只显示前 {items.length} 条,共 {total} 条 — 用筛选缩小范围看具体
        </p>
      )}
    </div>
  )
}

function KpiBox({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' }) {
  const toneClass = tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${toneClass}`}>{value}</div>
    </div>
  )
}

function ErrorRow({ row, onCodeClick }: { row: ClientErrorRow; onCodeClick: (code: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="p-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3 flex-wrap">
        <button
          onClick={() => onCodeClick(row.code)}
          className="font-mono text-xs font-semibold shrink-0 hover:underline"
        >
          {row.code}
        </button>
        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
          {formatRelative(row.created_at)}
        </span>
        <Badge variant="outline" className="text-[10px] font-mono shrink-0">
          {row.method} {row.path.length > 40 ? row.path.slice(0, 40) + '…' : row.path}
        </Badge>
        <span className="text-sm flex-1 min-w-0 break-words">{row.message}</span>
        {(row.detail || row.ua) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            {expanded ? '收起' : '展开'}
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-2 pl-2 border-l-2 border-muted space-y-1.5 text-xs">
          {row.user_id && (
            <div>
              <span className="text-muted-foreground">user:</span>{' '}
              <code className="bg-muted/60 px-1 rounded">{row.user_id.slice(0, 8)}…</code>
            </div>
          )}
          {row.url && (
            <div>
              <span className="text-muted-foreground">url:</span>{' '}
              <code className="bg-muted/60 px-1 rounded break-all">{row.url}</code>
            </div>
          )}
          {row.ua && (
            <div>
              <span className="text-muted-foreground">ua:</span>{' '}
              <span className="text-muted-foreground">{row.ua}</span>
            </div>
          )}
          {row.ip && (
            <div>
              <span className="text-muted-foreground">ip:</span>{' '}
              <code className="bg-muted/60 px-1 rounded">{row.ip}</code>
            </div>
          )}
          {row.detail && (
            <details className="mt-1">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                detail
              </summary>
              <pre className="mt-1 bg-muted/40 p-2 rounded text-[11px] whitespace-pre-wrap break-all max-h-48 overflow-auto">
                {row.detail}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
