// 数据流配置 service - spec-m2-004
//
// 让产品负责人在 admin 后台控制"老白每次回复时看到什么数据"
//
// 5 开关 + 6 可调参数,分散在 SystemConfig + 两个 extractor enable + fingerprint interval +
// long_term_memory_threshold/window_size + 4 个画像数据相关参数。
//
// 改了立即生效(下个 turn 拉新配置 — 没加内存缓存,直接读 DB,5 分钟内一定生效)

import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'

/** 拉用户默认头像 URL(没设过返 null) */
export async function getUserDefaultAvatarUrl(): Promise<string | null> {
  const row = await prisma.systemConfig.findUnique({
    where: { id: 'global' },
    select: { user_default_avatar_url: true },
  })
  return row?.user_default_avatar_url ?? null
}

/** admin 设置用户默认头像 URL(传 null = 删除回到 mobile 端 hardcode 默认) */
export async function setUserDefaultAvatarUrl(
  url: string | null,
  operator: { adminId: string },
): Promise<{ before: string | null; after: string | null }> {
  const before = await getUserDefaultAvatarUrl()
  await prisma.systemConfig.upsert({
    where: { id: 'global' },
    update: { user_default_avatar_url: url, updated_by: operator.adminId },
    create: {
      id: 'global',
      user_default_avatar_url: url,
      updated_by: operator.adminId,
    },
  })
  return { before, after: url }
}

/** 拉用户可选预设头像列表(没设过返空数组 → mobile fallback hardcode 8 张) */
export async function getUserPresetAvatarUrls(): Promise<string[]> {
  const row = await prisma.systemConfig.findUnique({
    where: { id: 'global' },
    select: { user_preset_avatar_urls: true },
  })
  return row?.user_preset_avatar_urls ?? []
}

/** admin 整体替换预设头像列表(传 [] = 清空,回到 mobile hardcode 8 张) */
export async function setUserPresetAvatarUrls(
  urls: string[],
  operator: { adminId: string },
): Promise<{ before: string[]; after: string[] }> {
  const before = await getUserPresetAvatarUrls()
  await prisma.systemConfig.upsert({
    where: { id: 'global' },
    update: { user_preset_avatar_urls: urls, updated_by: operator.adminId },
    create: {
      id: 'global',
      user_preset_avatar_urls: urls,
      updated_by: operator.adminId,
    },
  })
  return { before, after: urls }
}

export interface DataFlowConfig {
  switches: {
    profile_assertions: boolean
    observations: boolean
    language_fingerprint: boolean
    long_term_memory: boolean
    emotion_recognition: boolean
    observation_extractor: boolean
    fingerprint_extractor: boolean
  }
  params: {
    history_window_size: number
    long_term_memory_threshold: number
    long_term_memory_window_size: number
    profile_assertions_limit: number
    observations_limit: number
    fingerprint_extraction_interval: number
  }
  updated_at: Date | null
  updated_by: string | null
}

export interface UpdateDataFlowInput {
  switches?: Partial<DataFlowConfig['switches']>
  params?: Partial<DataFlowConfig['params']>
}

const PARAM_RANGES = {
  history_window_size: { min: 30, max: 200 },
  long_term_memory_threshold: { min: 20, max: 100 },
  long_term_memory_window_size: { min: 30, max: 200 },
  profile_assertions_limit: { min: 5, max: 50 },
  observations_limit: { min: 10, max: 100 },
  fingerprint_extraction_interval: { min: 5, max: 100 },
} as const

/** 拉当前数据流配置 */
export async function getDataFlowConfig(): Promise<DataFlowConfig> {
  const row = await prisma.systemConfig.findUnique({ where: { id: 'global' } })
  if (!row) {
    // SystemConfig 没初始化(冷启动场景),返默认值
    return {
      switches: {
        profile_assertions: true,
        observations: true,
        language_fingerprint: true,
        long_term_memory: true,
        emotion_recognition: true,
        observation_extractor: true,
        fingerprint_extractor: true,
      },
      params: {
        history_window_size: 80,
        long_term_memory_threshold: 30,
        long_term_memory_window_size: 80,
        profile_assertions_limit: 20,
        observations_limit: 30,
        fingerprint_extraction_interval: 20,
      },
      updated_at: null,
      updated_by: null,
    }
  }
  return {
    switches: {
      profile_assertions: row.enable_profile_assertions,
      observations: row.enable_relationship_observations,
      language_fingerprint: row.enable_user_language_fingerprint,
      long_term_memory: row.enable_long_term_memory,
      emotion_recognition: row.enable_emotion_recognition,
      observation_extractor: row.observation_extractor_enabled,
      fingerprint_extractor: row.fingerprint_extractor_enabled,
    },
    params: {
      history_window_size: row.history_window_size,
      long_term_memory_threshold: row.long_term_memory_threshold,
      long_term_memory_window_size: row.long_term_memory_window_size,
      profile_assertions_limit: row.profile_assertions_limit,
      observations_limit: row.observations_limit,
      fingerprint_extraction_interval: row.fingerprint_extraction_interval,
    },
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  }
}

/**
 * 修改数据流配置 — admin 操作落 admin_audit_logs
 */
export async function updateDataFlowConfig(
  input: UpdateDataFlowInput,
  operator: { adminId: string },
): Promise<DataFlowConfig> {
  // 校验参数范围
  if (input.params) {
    for (const [k, v] of Object.entries(input.params) as Array<
      [keyof typeof PARAM_RANGES, number]
    >) {
      if (v == null) continue
      const range = PARAM_RANGES[k]
      if (!range) continue
      if (v < range.min || v > range.max) {
        throw errors.validation(`${k} 必须在 ${range.min} - ${range.max} 之间(当前 ${v})`)
      }
    }
  }

  const before = await getDataFlowConfig()

  // 拼 prisma update data
  const data: Record<string, boolean | number | string> = {}
  if (input.switches) {
    if (input.switches.profile_assertions != null)
      data.enable_profile_assertions = input.switches.profile_assertions
    if (input.switches.observations != null)
      data.enable_relationship_observations = input.switches.observations
    if (input.switches.language_fingerprint != null)
      data.enable_user_language_fingerprint = input.switches.language_fingerprint
    if (input.switches.long_term_memory != null)
      data.enable_long_term_memory = input.switches.long_term_memory
    if (input.switches.emotion_recognition != null)
      data.enable_emotion_recognition = input.switches.emotion_recognition
    if (input.switches.observation_extractor != null)
      data.observation_extractor_enabled = input.switches.observation_extractor
    if (input.switches.fingerprint_extractor != null)
      data.fingerprint_extractor_enabled = input.switches.fingerprint_extractor
  }
  if (input.params) {
    if (input.params.history_window_size != null)
      data.history_window_size = input.params.history_window_size
    if (input.params.long_term_memory_threshold != null)
      data.long_term_memory_threshold = input.params.long_term_memory_threshold
    if (input.params.long_term_memory_window_size != null)
      data.long_term_memory_window_size = input.params.long_term_memory_window_size
    if (input.params.profile_assertions_limit != null)
      data.profile_assertions_limit = input.params.profile_assertions_limit
    if (input.params.observations_limit != null)
      data.observations_limit = input.params.observations_limit
    if (input.params.fingerprint_extraction_interval != null)
      data.fingerprint_extraction_interval = input.params.fingerprint_extraction_interval
  }

  if (Object.keys(data).length === 0) {
    throw errors.validation('至少要改一项')
  }

  data.updated_by = operator.adminId

  await prisma.systemConfig.upsert({
    where: { id: 'global' },
    update: data as { [k: string]: boolean | number | string },
    create: { id: 'global', ...(data as { [k: string]: boolean | number | string }) },
  })

  const after = await getDataFlowConfig()

  // 落 admin_audit_logs(schema 字段 admin_user_id,无 admin_username)
  await prisma.adminAuditLog
    .create({
      data: {
        admin_user_id: operator.adminId,
        action: 'UPDATE_DATA_FLOW_CONFIG',
        target_type: 'SystemConfig',
        target_id: 'global',
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify(after)),
      },
    })
    .catch(() => {
      /* 审计失败不阻断业务 */
    })

  return after
}
