// 预设头像(spec-018)
// DiceBear 9.x avataaars 风格,免费 + 无需 API key + 公开 SVG URL
// Sam 选定 avataaars(卡通人脸,温和气质,跟练爱"私聊"调性匹配)
//
// 8 个 seed 经过挑选:男女比例平衡 + 风格一致 + 不易撞脸
// 服务端只校验是 URL,具体哪 8 个由前端管理(产品决策,前端单点维护)

const DICEBEAR_BASE = 'https://api.dicebear.com/9.x/avataaars/svg'

export const PRESET_AVATARS: ReadonlyArray<string> = [
  `${DICEBEAR_BASE}?seed=Felix`,
  `${DICEBEAR_BASE}?seed=Lily`,
  `${DICEBEAR_BASE}?seed=Max`,
  `${DICEBEAR_BASE}?seed=Luna`,
  `${DICEBEAR_BASE}?seed=Oliver`,
  `${DICEBEAR_BASE}?seed=Mia`,
  `${DICEBEAR_BASE}?seed=Charlie`,
  `${DICEBEAR_BASE}?seed=Zoe`,
]

export function isPresetAvatar(url: string | null): boolean {
  if (!url) return false
  return PRESET_AVATARS.includes(url)
}
