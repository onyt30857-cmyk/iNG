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
