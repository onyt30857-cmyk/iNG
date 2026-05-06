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

// basic_facts JSON 内部 schema(放 how_we_met / age_range / key_facts 等自由字段)
const basicFactsSchema = z
  .object({
    how_we_met: z.string().max(200, '怎么认识的最多 200 字').optional(),
    age_range: z.string().max(20).optional(),
    gender: z.enum(['FEMALE', 'MALE', 'UNSPECIFIED']).optional(),
    key_facts: z.array(z.string().max(500)).max(20).optional(),
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
