// Storage 抽象层 - 头像 / 截图 OSS
//
// 设计:graceful degrade
// - 配了 SUPABASE_* env → 真上传 Supabase Storage,返 https URL
// - 没配 → fallback 直接返 base64 data URL(等价 M1 现状,前端 PATCH 进 db)
//
// 这样 dev 阶段无 keys 跑得通,Sam 在 Supabase 创建 bucket + 写 .env 后零代码切换。

import { Buffer } from 'node:buffer'
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase.js'
import { config } from '../../config/index.js'
import { errors } from '../../lib/error.js'

export interface PutAvatarResult {
  url: string
  /** 'supabase' = 真上传到 Supabase Storage,'data_url' = fallback */
  driver: 'supabase' | 'data_url'
}

const DATA_URL_RE = /^data:([^;]+);base64,(.+)$/

/**
 * 上传头像。
 * 输入:base64 data URL(前端压缩后的 256x256 jpeg)
 * 输出:url(可能是 https 或 data URL,取决于配置)
 */
export async function putAvatar(
  userId: string,
  dataUrl: string,
): Promise<PutAvatarResult> {
  // fallback:无配置直接返原 dataUrl(前端会 PATCH 进 db,跟 M1 行为一致)
  if (!isSupabaseConfigured()) {
    return { url: dataUrl, driver: 'data_url' }
  }

  const m = dataUrl.match(DATA_URL_RE)
  if (!m) {
    throw errors.validation('头像数据格式不对,需要 base64 data URL')
  }

  const contentType = m[1]!
  const base64 = m[2]!
  const buffer = Buffer.from(base64, 'base64')

  // 大小上限校验(避免恶意上传):1MB
  if (buffer.length > 1024 * 1024) {
    throw errors.validation('头像太大,前端应该压缩到 256x256')
  }

  const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('png') ? 'png' : 'bin'
  const filename = `${userId}/avatar-${Date.now()}.${ext}`

  const supabase = getSupabaseClient()!
  const { error } = await supabase.storage
    .from(config.SUPABASE_AVATAR_BUCKET)
    .upload(filename, buffer, {
      contentType,
      upsert: true, // 同 user 下覆盖旧的(不留垃圾)
      cacheControl: '31536000', // 1 年(头像内容不变,文件名带 timestamp 已防 stale)
    })

  if (error) {
    throw errors.internal(`Supabase 上传失败:${error.message}`)
  }

  const { data } = supabase.storage
    .from(config.SUPABASE_AVATAR_BUCKET)
    .getPublicUrl(filename)

  return { url: data.publicUrl, driver: 'supabase' }
}

/**
 * 删除头像(可选,M2 用户换头像 + 真删旧的避免存储成本累积)
 */
export async function deleteAvatar(filename: string): Promise<void> {
  if (!isSupabaseConfigured()) return // data_url 模式不存,无需删
  const supabase = getSupabaseClient()!
  await supabase.storage.from(config.SUPABASE_AVATAR_BUCKET).remove([filename])
}
