// 关系档案 Zod 校验
// CLAUDE.md §3 命名:数据库 snake_case,这里跟随 schema.prisma 字段名

import { z } from 'zod'

// 关系阶段枚举(对应 schema.prisma RelationshipStage)
export const relationshipStageSchema = z.enum([
  'INIT',       // 初识(刚认识不久)
  'FLIRTING',   // 暧昧期(在互相试探)
  'COMMITTED',  // 已确定关系/长期伴侣
  'CONFLICT',   // 冷淡期/冲突中
  'RECOVERY',   // 挽回阶段
  'ENDED',      // 已结束(M1 仅作为终态展示)
])

// M3.1 多语言场景:她说什么语言
// zh = 默认;en/th/vi 触发跨语言模式(老白话术用对方语言+中文括注)
export const herLanguageSchema = z.enum(['zh', 'en', 'th', 'vi'])
export type HerLanguage = z.infer<typeof herLanguageSchema>

// basic_facts JSON 内部 schema(放 how_we_met / age_range / key_facts 等自由字段)
// spec-008 Phase 2.2:加 pending_facts 待确认区,low confidence 抽取进这里,
// 用户在档案页 ✓ 后转入 key_facts(高 confidence 抽取直接进 key_facts)
const basicFactsSchema = z
  .object({
    how_we_met: z.string().max(200, '怎么认识的最多 200 字').optional(),
    age_range: z.string().max(20).optional(),
    gender: z.enum(['FEMALE', 'MALE', 'UNSPECIFIED']).optional(),
    key_facts: z.array(z.string().max(500)).max(50).optional(),
    pending_facts: z
      .array(
        z.object({
          text: z.string().max(500),
          evidence_quote: z.string().max(800),
          kind: z.enum(['background', 'preference', 'person', 'event']),
          captured_at: z.string(), // ISO
        }),
      )
      .max(30)
      .optional(),
    // spec-008 Phase 2.3 反例学习:用户主动 reject 的事实进这里,
    // 下次抽取 prompt 把它们作 negative example 传给 LLM
    rejected_facts: z.array(z.string().max(500)).max(50).optional(),
  })
  .strict() // 多余字段直接拒绝,防止注入

// user_reminders JSON 数组
const userRemindersSchema = z.array(z.string().max(200)).max(50)

export const createRelationshipSchema = z.object({
  name: z.string().trim().min(1, '称呼不能为空').max(20, '称呼最多 20 个字'),
  stage: relationshipStageSchema,
  avatar_seed: z.string().max(50).optional(),
  basic_facts: basicFactsSchema.optional(),
  user_reminders: userRemindersSchema.optional(),
  her_language: herLanguageSchema.optional(),
})

// 更新:所有字段 optional,但 name 仍要校验长度(空字符串排除)
// avatar_url 暂时存 data URL(M1 dev 简化,M2 接 OSS 后改 https URL),
// 256x256 jpeg base64 一般在 30-50KB,250KB 上限留余量
export const updateRelationshipSchema = z.object({
  name: z.string().trim().min(1).max(20).optional(),
  stage: relationshipStageSchema.optional(),
  avatar_seed: z.string().max(50).optional(),
  avatar_url: z.string().max(250_000, '头像太大,换张小一点的').nullable().optional(),
  basic_facts: basicFactsSchema.optional(),
  user_reminders: userRemindersSchema.optional(),
  her_language: herLanguageSchema.optional(),
})

// 列表查询参数
export const listRelationshipsQuerySchema = z.object({
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
})

// URL 参数
export const relationshipIdParamSchema = z.object({
  id: z.string().min(1),
})

// 添加用户提醒(单条)
export const addNoteBodySchema = z.object({
  content: z.string().trim().min(1, '提醒不能为空').max(200, '提醒最多 200 字'),
})

export type CreateRelationshipInput = z.infer<typeof createRelationshipSchema>
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipSchema>
export type RelationshipStage = z.infer<typeof relationshipStageSchema>
