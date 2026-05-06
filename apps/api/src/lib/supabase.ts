// Supabase client 单例
//
// 没配 SUPABASE_URL / SUPABASE_SERVICE_KEY 返 null,业务层 graceful degrade。
// 配了就生效,所有 storage 调用走 Supabase Storage(S3 兼容)。

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config/index.js'

let client: SupabaseClient | null = null
let initialized = false

export function getSupabaseClient(): SupabaseClient | null {
  if (initialized) return client

  initialized = true
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) {
    return null
  }

  client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

export function isSupabaseConfigured(): boolean {
  return !!(config.SUPABASE_URL && config.SUPABASE_SERVICE_KEY)
}
