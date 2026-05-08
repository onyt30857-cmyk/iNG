// 预设头像(spec-018)
// DiceBear 9.x avataaars,免费 + 公开 SVG URL
//
// 强制 eyes + mouth 参数:avataaars 默认会随机出现"X 死人眼"/"哭脸"等丧表情,
// 跟练爱"温和私聊"调性冲突。锁定为 default/happy/wink × smile/twinkle 几种安全表情。
// seed 决定头型/发型/肤色/服装,这些字段不限制让 8 个头像视觉差异化。
//
// 用 mouth/eyes 多值传(逗号分隔)→ DiceBear 按 seed 确定性挑选其中一个
// 8 个表情多样但全部友好。

const DICEBEAR_BASE = 'https://api.dicebear.com/9.x/avataaars/svg'
const SAFE_PARAMS = 'mouth=smile,twinkle&eyes=default,happy,wink'

function preset(seed: string): string {
  return `${DICEBEAR_BASE}?seed=${seed}&${SAFE_PARAMS}`
}

export const PRESET_AVATARS: ReadonlyArray<string> = [
  preset('Aneka'),
  preset('Lily'),
  preset('Max'),
  preset('Luna'),
  preset('Oliver'),
  preset('Mia'),
  preset('Charlie'),
  preset('Zoe'),
]

export function isPresetAvatar(url: string | null): boolean {
  if (!url) return false
  return PRESET_AVATARS.includes(url)
}
