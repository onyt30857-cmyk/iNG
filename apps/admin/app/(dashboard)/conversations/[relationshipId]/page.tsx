'use client'

// 对话查阅器(spec-016 Level 2)
// 左右栏 Inspector:左 timeline,右 selected message detail

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ThumbsDown, ThumbsUp, MessageSquare, AlertTriangle, ShieldOff, Sparkles } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { formatDate, formatBubbleTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface RelationshipOverview {
  id: string
  user_id: string
  name: string
  stage: string
  archived: boolean
  message_count: number
  last_message_at: string | null
  dislike_count: number
  red_line_count: number
  persona_fail_count: number
}

interface AiMetadata {
  model: string
  cost_usd: number
  duration_ms: number
  persona_passed: boolean
  input_tokens: number
  output_tokens: number
}

interface FeedbackItem {
  type: string
  note: string | null
  bubble_text: string | null
  created_at: string
}

interface RedLine {
  category: string | null
  source_type: string
  created_at: string
}

interface ConversationMessage {
  id: string
  session_id: string
  relationship_id: string
  role: string
  content: string | null
  screenshot_url: string | null
  created_at: string
  ai_metadata: AiMetadata | null
  feedback: FeedbackItem[]
  red_line: RedLine | null
}

type RoleFilter = 'all' | 'laoke' | 'user' | 'system'

export default function ConversationInspectorPage() {
  const params = useParams<{ relationshipId: string }>()
  const relId = params.relationshipId

  const [overview, setOverview] = useState<RelationshipOverview | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selected, setSelected] = useState<ConversationMessage | null>(null)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [onlyFlagged, setOnlyFlagged] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      adminGet<RelationshipOverview>(`/v1/admin/relationships/${relId}/overview`),
      adminGet<{ items: ConversationMessage[]; has_more: boolean }>(
        `/v1/admin/relationships/${relId}/messages`,
        { limit: 100, role_filter: roleFilter },
      ),
    ]).then(([overviewRes, msgsRes]) => {
      if (cancelled) return
      setLoading(false)
      if (overviewRes.ok) setOverview(overviewRes.data)
      if (msgsRes.ok) {
        setMessages(msgsRes.data.items)
        setHasMore(msgsRes.data.has_more)
        if (msgsRes.data.items.length > 0) {
          setSelected(msgsRes.data.items[0]!)
        }
      } else {
        setErrorMsg(msgsRes.error.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [relId, roleFilter])

  async function loadMore() {
    if (!hasMore || messages.length === 0) return
    const last = messages[messages.length - 1]!
    const res = await adminGet<{ items: ConversationMessage[]; has_more: boolean }>(
      `/v1/admin/relationships/${relId}/messages`,
      {
        limit: 100,
        before: last.created_at,
        role_filter: roleFilter,
      },
    )
    if (res.ok) {
      setMessages([...messages, ...res.data.items])
      setHasMore(res.data.has_more)
    }
  }

  // 客户端二级筛选(只看带标记的)
  const visibleMessages = onlyFlagged
    ? messages.filter(
        (m) => m.feedback.length > 0 || m.red_line || (m.ai_metadata && !m.ai_metadata.persona_passed),
      )
    : messages

  return (
    <div className="container max-w-[1400px] py-6 space-y-4">
      {/* 顶部 — 关系基本信息 + 工具栏 */}
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={overview ? `/users/${overview.user_id}` : '/users'}>
            <ArrowLeft className="h-4 w-4" /> 回用户详情
          </Link>
        </Button>
      </div>

      {overview && (
        <Card>
          <CardContent className="p-5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl font-semibold">{overview.name}</h1>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Badge variant="muted">{overview.stage}</Badge>
                <span>{overview.message_count} 条消息</span>
                {overview.last_message_at && (
                  <span>· 最后活动 {formatDate(overview.last_message_at)}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {overview.dislike_count > 0 && (
                <Badge variant="destructive">
                  <ThumbsDown className="h-3 w-3 mr-1" /> {overview.dislike_count} 次吐槽
                </Badge>
              )}
              {overview.red_line_count > 0 && (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" /> {overview.red_line_count} 次红线
                </Badge>
              )}
              {overview.persona_fail_count > 0 && (
                <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 px-2.5 py-0.5 text-xs">
                  <ShieldOff className="h-3 w-3 mr-1" /> 老白出格 {overview.persona_fail_count} 次
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 工具栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">全部消息</option>
          <option value="laoke">只看老白</option>
          <option value="user">只看用户</option>
          <option value="system">只看系统</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
          />
          只看异常(👎/🚨/persona fail)
        </label>
        {visibleMessages.length !== messages.length && (
          <span className="text-xs text-muted-foreground">
            筛后 {visibleMessages.length} / 共 {messages.length}
          </span>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}
      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {/* 左右栏 Inspector */}
      {!loading && messages.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr] xl:grid-cols-[1fr_1.2fr] lg:min-h-[600px]">
          {/* 左:微信式气泡 timeline(跟用户端 LaokeBubble 视觉对齐 — spec-022 fix)*/}
          <Card className="overflow-hidden flex flex-col max-h-[60vh] lg:max-h-[80vh]">
            <div
              className="overflow-y-auto flex-1 px-4 py-4 space-y-3"
              style={{ background: '#EDEDED' }}
            >
              {visibleMessages.map((m, idx) => {
                const isSelected = selected?.id === m.id
                const hasFeedback = m.feedback.length > 0
                const hasRedLine = !!m.red_line
                const personaFail = m.ai_metadata && !m.ai_metadata.persona_passed
                const isLaoke = m.role === 'LAOKE'
                const isUser = m.role === 'USER' || m.role === 'USER_SCREENSHOT'
                const isSystem = !isLaoke && !isUser

                // 2026-05-12:识别"她回的引用"消息 — mobile 端用户勾"粘她回的原话"发送时,
                // user_text 被包成 `[她刚回了我:"原话"]\n\n这是她发给我的原话...` 后端原样存
                // admin 端按 content prefix 识别,渲染成"她"风格气泡(左侧、不同色、tag)
                const otherQuoteMatch = m.content?.match(/^\[她刚回了我:"([\s\S]+?)"\]\n\n这是她发给我的原话/)
                const isOtherQuote = isUser && !!otherQuoteMatch
                const displayContent = isOtherQuote ? otherQuoteMatch[1]! : m.content

                // 跟上一条对比是否同角色 + 30s 内 → 不重复显示头像/时间
                // "她"消息单独算一种角色(不跟 USER/LAOKE 合并)
                const effectiveRole = isOtherQuote ? 'OTHER_QUOTE' : m.role
                const prev = idx > 0 ? visibleMessages[idx - 1] : null
                const prevEffectiveRole =
                  prev
                    ? (prev.role === 'USER' && prev.content?.match(/^\[她刚回了我:"/) ? 'OTHER_QUOTE' : prev.role)
                    : null
                const sameAuthorAsPrev =
                  prev &&
                  prevEffectiveRole === effectiveRole &&
                  Math.abs(new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) < 30_000

                if (isSystem) {
                  return (
                    <div
                      key={m.id}
                      className="text-center text-xs text-muted-foreground py-2 cursor-pointer hover:text-foreground"
                      onClick={() => setSelected(m)}
                    >
                      {m.content ?? '系统消息'}
                    </div>
                  )
                }

                // "她"消息渲染在左侧(跟老白同侧),区分用粉色调 + tag,跟兄弟(绿色右侧)对立
                const bubbleSide = isOtherQuote ? 'left' : isUser ? 'right' : 'left'

                return (
                  <div key={m.id}>
                    <div
                      className={`flex items-end gap-2 ${bubbleSide === 'right' ? 'justify-end' : 'justify-start'}`}
                      onClick={() => setSelected(m)}
                    >
                      {/* 老白头像(同角色连续不重复显示)*/}
                      {isLaoke && (
                        <div className="w-8 h-8 shrink-0">
                          {!sameAuthorAsPrev && (
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center"
                              style={{ background: '#EFEAFF' }}
                            >
                              <span style={{ fontSize: '14px', color: '#7C5CFF', fontWeight: 600 }}>老</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* "她"头像(跟老白同侧但用粉色) */}
                      {isOtherQuote && (
                        <div className="w-8 h-8 shrink-0">
                          {!sameAuthorAsPrev && (
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center"
                              style={{ background: '#FFE4EC' }}
                            >
                              <span style={{ fontSize: '14px', color: '#E91E63', fontWeight: 600 }}>她</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 气泡 + 时间小字纵向包一层 */}
                      <div className={`flex flex-col max-w-[78%] ${bubbleSide === 'right' ? 'items-end' : 'items-start'}`}>
                        {/* "她"消息上方加 "她 回的" 小 tag */}
                        {isOtherQuote && !sameAuthorAsPrev && (
                          <span className="text-[10px] text-pink-700 font-medium mb-0.5">她 回的</span>
                        )}
                        <div
                          className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap cursor-pointer transition-all ${
                            isSelected ? 'ring-2 ring-amber-400 ring-offset-1' : 'hover:brightness-95'
                          }`}
                          style={
                            isLaoke
                              ? {
                                  background: '#FFFFFF',
                                  color: '#1F2433',
                                  borderLeft: '2px solid #9B82FF',
                                  borderRadius: '4px 12px 12px 12px',
                                  boxShadow: '0 1px 4px rgba(0,0,0,.04)',
                                }
                              : isOtherQuote
                              ? {
                                  background: '#FFF0F5',
                                  color: '#1F2433',
                                  borderLeft: '2px solid #E91E63',
                                  borderRadius: '4px 12px 12px 12px',
                                  boxShadow: '0 1px 4px rgba(0,0,0,.04)',
                                }
                              : {
                                  background: '#95EC69',
                                  color: '#1F2433',
                                  borderRadius: '12px 4px 12px 12px',
                                  boxShadow: '0 1px 4px rgba(0,0,0,.04)',
                                }
                          }
                        >
                          {displayContent ?? (m.screenshot_url ? '🖼 [截图]' : '(空消息)')}

                          {/* 标记 chips 跟在气泡底部 */}
                          {(hasFeedback || hasRedLine || personaFail) && (
                            <div className="flex gap-1 mt-1.5 flex-wrap">
                              {m.feedback.map((f, i) => (
                                <span
                                  key={i}
                                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                    f.type === 'dislike'
                                      ? 'bg-red-100 text-red-700'
                                      : f.type === 'comment'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-green-100 text-green-700'
                                  }`}
                                >
                                  {f.type === 'dislike' ? '👎' : f.type === 'comment' ? '💬' : '👍'}
                                </span>
                              ))}
                              {hasRedLine && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                  🚨 {m.red_line!.category ?? 'red'}
                                </span>
                              )}
                              {personaFail && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                  🤖 出格
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 时间小字(每条都显示,跨日跨周自动相对化)*/}
                        <span className="text-[10px] text-muted-foreground/70 mt-1 px-1">
                          {formatBubbleTime(m.created_at)}
                        </span>
                      </div>

                      {/* 用户头像占位(连续同角色不显示;"她"消息走左侧不显示这个)*/}
                      {isUser && !isOtherQuote && (
                        <div className="w-8 h-8 shrink-0">
                          {!sameAuthorAsPrev && (
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center"
                              style={{ background: '#D1FADF' }}
                            >
                              <span style={{ fontSize: '12px', color: '#06994B', fontWeight: 600 }}>你</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {hasMore && (
                <div className="text-center pt-2">
                  <Button variant="outline" size="sm" onClick={loadMore}>
                    加载更早的消息 ↓
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* 右:Detail Inspector */}
          <Card className="overflow-hidden flex flex-col max-h-[60vh] lg:max-h-[80vh]">
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {selected ? (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
                      <span>
                        {selected.role === 'LAOKE'
                          ? '🤖 老白'
                          : selected.role === 'USER' || selected.role === 'USER_SCREENSHOT'
                          ? '👤 用户'
                          : '⚙️ 系统'}{' '}
                        · {formatDate(selected.created_at)}
                      </span>
                      <code className="text-[10px]">{selected.id.slice(0, 12)}</code>
                    </div>
                    <div className="text-sm whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-md p-3">
                      {selected.content ?? (selected.screenshot_url ? '[截图]' : '(空)')}
                    </div>
                    {selected.screenshot_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selected.screenshot_url}
                        alt=""
                        className="mt-2 max-w-full rounded-md border"
                      />
                    )}
                  </div>

                  {/* AI metadata */}
                  {selected.ai_metadata && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3" /> AI 调用 metadata(fuzzy 关联)
                      </div>
                      <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-3 space-y-1">
                        <div>
                          model:{' '}
                          <span className="font-mono">
                            {selected.ai_metadata.model.replace('claude-', '')}
                          </span>
                        </div>
                        <div>
                          tokens: {selected.ai_metadata.input_tokens} 入 /{' '}
                          {selected.ai_metadata.output_tokens} 出
                        </div>
                        <div>
                          耗时:{' '}
                          {selected.ai_metadata.duration_ms < 1000
                            ? `${selected.ai_metadata.duration_ms}ms`
                            : `${(selected.ai_metadata.duration_ms / 1000).toFixed(2)}s`}
                        </div>
                        <div>
                          成本:¥{(selected.ai_metadata.cost_usd * 7.2).toFixed(4)}
                        </div>
                        <div>
                          老白persona:{' '}
                          {selected.ai_metadata.persona_passed ? (
                            <span className="text-green-600">✓ 通过</span>
                          ) : (
                            <span className="text-amber-600">✗ 出格(扫到机器感词)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 反馈 */}
                  {selected.feedback.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium flex items-center gap-1.5">
                        <MessageSquare className="h-3 w-3" /> 用户反馈({selected.feedback.length})
                      </div>
                      {selected.feedback.map((f, i) => (
                        <div
                          key={i}
                          className={`rounded-md p-3 text-sm ${
                            f.type === 'dislike'
                              ? 'bg-red-50 dark:bg-red-950/20 border border-red-200'
                              : f.type === 'comment'
                              ? 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200'
                              : 'bg-green-50 dark:bg-green-950/20 border border-green-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1 text-xs">
                            {f.type === 'dislike' ? (
                              <ThumbsDown className="h-3 w-3" />
                            ) : f.type === 'like' ? (
                              <ThumbsUp className="h-3 w-3" />
                            ) : (
                              <MessageSquare className="h-3 w-3" />
                            )}
                            <span>{f.type}</span>
                            <span className="text-muted-foreground ml-auto">
                              {formatDate(f.created_at)}
                            </span>
                          </div>
                          {f.note && <div className="text-foreground">{f.note}</div>}
                          {f.bubble_text && f.bubble_text !== selected.content && (
                            <div className="text-xs text-muted-foreground mt-1 italic">
                              当时气泡:{f.bubble_text.slice(0, 100)}…
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 红线 */}
                  {selected.red_line && (
                    <div className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-300 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-400 mb-1">
                        <AlertTriangle className="h-4 w-4" />
                        红线触发({selected.red_line.source_type})
                      </div>
                      <div className="text-xs text-muted-foreground">
                        category:{' '}
                        <span className="font-mono">{selected.red_line.category ?? '(无)'}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(selected.red_line.created_at)}
                      </div>
                    </div>
                  )}

                  {/* 空 */}
                  {!selected.ai_metadata &&
                    selected.feedback.length === 0 &&
                    !selected.red_line && (
                      <p className="text-xs text-muted-foreground italic">
                        这条消息没有关联 metadata
                      </p>
                    )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center pt-12">
                  从左边点一条消息看详情
                </p>
              )}
            </div>
          </Card>
        </div>
      )}

      {!loading && messages.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            这段关系还没有消息
          </CardContent>
        </Card>
      )}
    </div>
  )
}
