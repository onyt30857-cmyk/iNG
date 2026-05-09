'use client'

import { AlertCircle, Search } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

// 错误码字典(spec-020)
// ⚠️ 修改这里时同步改 apps/mobile/utils/error-codes.ts 的 ERROR_DICT
// 静态 hardcode,不走数据库 — 错误码定义本来就是工程决策,不需要运营改

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
    internal_description: '请求超时(>30s 无响应)',
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

export default function ErrorsPage() {
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
    <div className="container max-w-5xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <AlertCircle className="h-5 w-5" /> 错误码字典
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          用户报错时会带"代号"(如 NW01),在这里查对应是什么内部问题。
          <span className="text-xs"> · 共 {ERRORS.length} 条</span>
        </p>
      </div>

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

      <div className="space-y-3">
        {filtered.map((e) => (
          <Card key={e.code}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono font-semibold text-base">{e.code}</span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLOR[e.category]}`}
                >
                  {e.category}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">👤 用户看到</div>
                  <div className="text-sm">&ldquo;{e.user_message} · 代号 {e.code}&rdquo;</div>
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

      <Card>
        <CardContent className="pt-5 text-xs text-muted-foreground space-y-1">
          <p>📌 这张表是<strong>静态字典</strong>(代码内 hardcoded),不走数据库。错误码是工程决策,不需要运营改。</p>
          <p>📌 想查<strong>具体某次错误的细节</strong>(谁报的 / 何时 / 完整堆栈) → 去 <strong>AI 监控</strong>(ai_call_logs)+ Sentry</p>
          <p>📌 想加新错误码 → 改 <code>apps/mobile/utils/error-codes.ts</code> + 这页同步</p>
        </CardContent>
      </Card>
    </div>
  )
}
