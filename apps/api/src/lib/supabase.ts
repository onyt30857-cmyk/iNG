// Supabase client 单例
//
// 没配 SUPABASE_URL / SUPABASE_SERVICE_KEY 返 null,业务层 graceful degrade。
// 配了就生效,所有 storage 调用走 Supabase Storage(S3 兼容)。

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config/index.js'
import { logger } from './logger.js'

let client: SupabaseClient | null = null
let initialized = false
// 临时调试(2026-05-08):暴露 init 失败的真实 error,让 /v1/storage/status 能看到
export let lastInitError: string | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (initialized) return client

  initialized = true
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) {
    return null
  }

  try {
    client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      // 显式禁用 realtime(我们只用 Storage)— 虽然 supabase-js v2 不能完全禁,
      // 但传一个不让它自动连的 config,减少 WebSocket 路径触发
      realtime: {
        params: { eventsPerSecond: 0 },
      },
    })
    logger.info({ event: 'supabase.init.ok' }, 'Supabase client 创建成功')
    return client
  } catch (e) {
    const err = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    lastInitError = err
    logger.error({ event: 'supabase.init.failed', err }, 'Supabase createClient 抛错')
    return null
  }
}

export function isSupabaseConfigured(): boolean {
  return !!(config.SUPABASE_URL && config.SUPABASE_SERVICE_KEY)
}
