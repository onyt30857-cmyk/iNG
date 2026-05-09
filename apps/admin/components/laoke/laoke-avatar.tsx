// 老白头像 SVG 组件(admin 端,跟 mobile/components/LaokeAvatar.vue 同款)
// 戴细框眼镜 + 微笑 + 眉毛 + 毛衣领口

interface Props {
  size?: number
  withBackground?: boolean
  className?: string
}

export function LaokeAvatar({ size = 80, withBackground = true, className = '' }: Props) {
  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 ${withBackground ? 'rounded-full' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        background: withBackground ? '#EFEAFF' : 'transparent',
      }}
    >
      <svg
        width={size * 0.78}
        height={size * 0.78}
        viewBox="0 0 24 24"
        fill="none"
        style={{ color: '#7C5CFF' }}
      >
        {/* 耳朵 */}
        <path d="M5.4 13.5 c -0.6 0.2 -0.9 0.8 -0.7 1.4 c 0.15 0.45 0.55 0.7 1.0 0.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M18.6 13.5 c 0.6 0.2 0.9 0.8 0.7 1.4 c -0.15 0.45 -0.55 0.7 -1.0 0.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        {/* 头脸 */}
        <path d="M5.5 12.5 a6.5 6.5 0 0 1 13 0 v3.5 a2.5 2.5 0 0 1 -2.5 2.5 h-8 a2.5 2.5 0 0 1 -2.5 -2.5 z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        {/* 头发两缕 */}
        <path d="M7 9.5 Q 9 6.5 12 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M12 7 Q 15 6.5 17 9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        {/* 眉毛 */}
        <path d="M7.8 11 Q 9.4 10.4 10.8 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M13.2 11 Q 14.6 10.4 16.2 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        {/* 眼镜 */}
        <circle cx="9.3" cy="13.2" r="1.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="14.7" cy="13.2" r="1.5" stroke="currentColor" strokeWidth="1.4" />
        <line x1="10.8" y1="13.2" x2="13.2" y2="13.2" stroke="currentColor" strokeWidth="1.2" />
        {/* 嘴角微弯 */}
        <path d="M10.5 16.6 Q 12 17.2 13.5 16.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        {/* 毛衣领口 */}
        <path d="M9.5 19.5 Q 12 21 14.5 19.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      </svg>
    </div>
  )
}
