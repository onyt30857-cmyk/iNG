// Supabase client 单例
//
// 没配 SUPABASE_URL / SUPABASE_SERVICE_KEY 返 null,业务层 graceful degrade。
// 配了就生效,所有 storage 调用走 Supabase Storage(S3 兼容)。

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config/index.js'
import { logger } from './logger.js'

let client: SupabaseClient | null = null
let initialized = false

export function getSupabaseClient(): SupabaseClient | null {
  if (initialized) return client

  initialized = true
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) {
    return null
  }

  try {
    client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      // 显式压低 realtime(我们只用 Storage)
      realtime: { params: { eventsPerSecond: 0 } },
    })
    logger.info({ event: 'supabase.init.ok' }, 'Supabase client 创建成功')
    return client
  } catch (e) {
    // createClient 抛错(如 service_role key 含非法 header 字符)— log 但不 throw,
    // 让业务层 graceful degrade 到 data_url
    logger.error({ event: 'supabase.init.failed', err: e }, 'Supabase createClient 抛错')
    return null
  }
}

export function isSupabaseConfigured(): boolean {
  return !!(config.SUPABASE_URL && config.SUPABASE_SERVICE_KEY)
}
