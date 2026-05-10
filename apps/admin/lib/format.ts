// 格式化辅助

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelative(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  const diff = Date.now() - date.getTime()
  const min = Math.floor(diff / 60_000)
  const hour = Math.floor(diff / 3_600_000)
  const day = Math.floor(diff / 86_400_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  if (hour < 24) return `${hour} 小时前`
  if (day < 30) return `${day} 天前`
  return formatDate(date).slice(0, 10)
}

export function formatPercent(n: number, digits = 1): string {
  if (Number.isNaN(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

// 对话气泡下显示的时间小字 — 跟 mobile/utils/format-time.ts 保持同算法
// - 今天 → "13:42"
// - 昨天 → "昨天 13:42"
// - 7 天内 → "周三 13:42"
// - 同年更早 → "5/7 13:42"
// - 跨年 → "2025/12/31 13:42"
export function formatBubbleTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const time = `${hh}:${mm}`
  const now = new Date()
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const that0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((today0 - that0) / 86_400_000)
  if (diffDays === 0) return time
  if (diffDays === 1) return `昨天 ${time}`
  if (diffDays >= 2 && diffDays <= 6) {
    return `周${'日一二三四五六'[d.getDay()]} ${time}`
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${time}`
}
