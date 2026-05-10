// 把消息 created_at(ISO 字符串)格式化成气泡下显示的时间小字。
// - 今天 → "13:42"
// - 昨天 → "昨天 13:42"
// - 7 天内 → "周三 13:42"
// - 更早 → "5/7 13:42"
// - 跨年 → "2025/12/31 13:42"
export function formatBubbleTime(iso: string | undefined | null): string {
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
