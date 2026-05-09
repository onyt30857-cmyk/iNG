// 错误码字典(spec-020)
//
// 用户看到的错误统一通过这个字典映射 — 不再把技术 error message 直接抛给用户。
// 用户报错时给的"代号"(NW01 / AI01 等),admin /errors 页能查到对应内部含义。
//
// 设计原则:
// - 代号简短(2 字母 + 2 数字),用户能口头报
// - 用户文案符合老白人格(不"您"/不"请重试"/不机器感)
// - 内部说明给运营看,标明排查方向
//
// 修改这里时同步改 apps/admin/app/(dashboard)/errors/page.tsx 静态字典

export type ErrorCode =
  | 'NW01' // 网络层失败(fetch 抛错)
  | 'NW02' // 请求超时
  | 'AU01' // 401 未鉴权
  | 'AU02' // 鉴权 refresh 也失败
  | 'QU01' // 402 免费额度用完
  | 'RL01' // 红线触发
  | 'AI01' // AI 调用失败(Anthropic 5xx / 余额不足等)
  | 'SV01' // 500 internal
  | 'PM01' // 权限不足
  | 'UN01' // 未分类

export interface ErrorEntry {
  code: ErrorCode
  /** 用户看到的话(老白人格,不带技术细节)*/
  user_message: string
  /** 后台运营看的内部含义 */
  internal_description: string
  /** 排查思路(给运营 / 客服)*/
  troubleshoot: string
}

export const ERROR_DICT: Record<ErrorCode, ErrorEntry> = {
  NW01: {
    code: 'NW01',
    user_message: '网断了一下,你刷新一下试试',
    internal_description: '前端 fetch / uni.request 网络层失败(无 HTTP 响应)',
    troubleshoot:
      '检查用户手机是否切换网络;Railway 后端是否在线(curl /health);是否 CORS preflight 失败',
  },
  NW02: {
    code: 'NW02',
    user_message: '等响应等久了,可能在路上,稍等一下',
    internal_description: '请求超时(>30s 无响应)',
    troubleshoot: '查 ai_call_logs 那段时间的 duration_ms;Anthropic 是否慢;是否大 prompt',
  },
  AU01: {
    code: 'AU01',
    user_message: '账号信息过期了,系统正在帮你重新登',
    internal_description: 'access token 过期,silent reauth 自动触发中',
    troubleshoot: '正常情况会自动恢复;如果连续报 = refresh_token 也过期 → 看 AU02',
  },
  AU02: {
    code: 'AU02',
    user_message: '账号失联了,你点一下"用备份码恢复账户"',
    internal_description: 'refresh_token 也失效,无法 silent reauth',
    troubleshoot: '让用户去"我的"页用备份码恢复;或重新匿名注册(失去原账户数据)',
  },
  QU01: {
    code: 'QU01',
    user_message: '今天的积分用完了,明早 0 点重置',
    internal_description: '免费用户每日积分上限达到(spec-019)',
    troubleshoot:
      '查 daily_usage 表对应用户当日 points_used;如果是异常(用得太快)看 ai_call_logs 是否被刷',
  },
  RL01: {
    code: 'RL01',
    user_message: '这个老白没法接,你换个角度说说',
    internal_description: '红线触发(NSFW / PUA / 跟踪辅助等 7 类)',
    troubleshoot: '查 moderation_logs 该用户的 category 字段;持续触发 → tag red_line_hit',
  },
  AI01: {
    code: 'AI01',
    user_message: '老白这次没接住,你重发一下',
    internal_description: 'AI 调用失败(Anthropic 500 / 余额不足 / SDK 错)',
    troubleshoot:
      '查 ai_call_logs error_message;看 /settings/billing 余额是否足;Anthropic status 页',
  },
  SV01: {
    code: 'SV01',
    user_message: '系统抽了下风,等会儿再来',
    internal_description: '后端 500 internal error(未分类异常)',
    troubleshoot: 'Sentry 看堆栈;Railway logs 那段时间的报错',
  },
  PM01: {
    code: 'PM01',
    user_message: '这个你没权限,可能是别人的关系',
    internal_description: '403 权限不足(多关系隔离 / 别人的数据)',
    troubleshoot: '检查 relationship_id 的 user_id 是否匹配 token user_id;前端是否传错',
  },
  UN01: {
    code: 'UN01',
    user_message: '出了个没见过的错,系统记下了正在查',
    internal_description: '未分类错误,fallback',
    troubleshoot: '看 Sentry 该时间点的 unhandled error;补充到 ERROR_DICT',
  },
}

/**
 * 根据错误对象推断错误码
 * 优先级:HTTP status code > error message 关键词 > UN01
 */
export function classifyError(err: unknown): ErrorCode {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  // HTTP 状态码(error message 里若包含 "http XXX:")
  const httpMatch = msg.match(/http (\d{3})/i)
  if (httpMatch) {
    const status = Number(httpMatch[1])
    if (status === 401) return 'AU01'
    if (status === 403) return 'PM01'
    if (status === 402) return 'QU01'
    if (status >= 500) return 'SV01'
  }

  // 关键词
  if (lower.includes('网络层') || lower.includes('network') || lower.includes('fetch failed')) {
    return 'NW01'
  }
  if (lower.includes('timeout') || lower.includes('超时')) return 'NW02'
  if (lower.includes('free_quota') || lower.includes('额度')) return 'QU01'
  if (lower.includes('red_line') || lower.includes('红线') || lower.includes('refusal')) {
    return 'RL01'
  }
  if (lower.includes('anthropic') || lower.includes('claude') || lower.includes('ai_call')) {
    return 'AI01'
  }
  if (lower.includes('auth_failed') || lower.includes('login') || lower.includes('登录')) {
    return 'AU02'
  }

  return 'UN01'
}

/**
 * 给用户的最终展示文案 — 友好话 + 代号
 * 例:"网断了一下,你刷新一下试试 · 代号 NW01"
 */
export function userFacingError(err: unknown): string {
  const code = classifyError(err)
  const entry = ERROR_DICT[code]
  return `${entry.user_message} · 代号 ${code}`
}
