// 系统配置 service(spec-015)— 配额限制 + bypass 开关
//
// 单行设计:system_config 表只一行 id='global'
// 缓存:5 分钟内存缓存(改了立刻清缓存即时生效;集群多副本时需要消息总线通知,M2)

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

export interface SystemConfig {
  quota_turn: number
  quota_ocr: number
  quota_heavy: number
  quota_bypass_enabled: boolean
  updated_by: string | null
  updated_at: Date
}

interface CachedConfig {
  config: SystemConfig
  cached_at: number
}

const CACHE_TTL_MS = 5 * 60_000 // 5 分钟
let cache: CachedConfig | null = null

/**
 * 读全局配置(带缓存)— quota.service.ts / 各业务用
 * 第一次读时如果表里没行,upsert 一条默认值
 */
export async function loadSystemConfig(): Promise<SystemConfig> {
  if (cache && Date.now() - cache.cached_at < CACHE_TTL_MS) {
    return cache.config
  }

  const row = await prisma.systemConfig.upsert({
    where: { id: 'global' },
    update: {},
    create: { id: 'global' },
  })

  const config: SystemConfig = {
    quota_turn: row.quota_turn,
    quota_ocr: row.quota_ocr,
    quota_heavy: row.quota_heavy,
    quota_bypass_enabled: row.quota_bypass_enabled,
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  }

  cache = { config, cached_at: Date.now() }
  return config
}

/** 直接拿当前值(不走缓存,确保最新)— admin 设置页用 */
export async function getSystemConfigFresh(): Promise<SystemConfig> {
  invalidateCache()
  return loadSystemConfig()
}

export interface UpdateConfigInput {
  quota_turn?: number
  quota_ocr?: number
  quota_heavy?: number
  quota_bypass_enabled?: boolean
}

export async function updateSystemConfig(
  adminId: string,
  patch: UpdateConfigInput,
): Promise<SystemConfig> {
  // 简单校验:数字必须 ≥ 0
  if (patch.quota_turn !== undefined && patch.quota_turn < 0) {
    throw new Error('quota_turn 必须 ≥ 0')
  }
  if (patch.quota_ocr !== undefined && patch.quota_ocr < 0) {
    throw new Error('quota_ocr 必须 ≥ 0')
  }
  if (patch.quota_heavy !== undefined && patch.quota_heavy < 0) {
    throw new Error('quota_heavy 必须 ≥ 0')
  }

  const row = await prisma.systemConfig.upsert({
    where: { id: 'global' },
    create: { id: 'global', ...patch, updated_by: adminId },
    update: { ...patch, updated_by: adminId },
  })

  invalidateCache()
  logger.info(
    {
      event: 'system_config.updated',
      admin_id: adminId,
      patch,
    },
    '系统配置已更新',
  )

  return {
    quota_turn: row.quota_turn,
    quota_ocr: row.quota_ocr,
    quota_heavy: row.quota_heavy,
    quota_bypass_enabled: row.quota_bypass_enabled,
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  }
}

export function invalidateCache(): void {
  cache = null
}
