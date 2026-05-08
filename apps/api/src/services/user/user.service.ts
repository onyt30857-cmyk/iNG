// 用户 service
// CLAUDE.md §5.1 Layer 2 - 后续 spec-003 接入 relationship_id 自动隔离中间件

import type { User } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'

export interface FindOrCreateResult {
  user: User
  isNewUser: boolean
}

/**
 * 用 wechat openid 查找或新建 user。
 *
 * 新用户:初始化 usage_stage = NEWBIE, total_sessions = 0
 * 老用户:更新 unionid(如有变更),其他不动
 */
export async function findOrCreateByWechatOpenId(
  openId: string,
  unionId?: string,
): Promise<FindOrCreateResult> {
  const existing = await prisma.user.findUnique({
    where: { wechat_open_id: openId },
  })

  if (existing) {
    // 老用户:补 unionid(老账号可能后注册)
    if (unionId && existing.wechat_union_id !== unionId) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: { wechat_union_id: unionId },
      })
      return { user: updated, isNewUser: false }
    }
    return { user: existing, isNewUser: false }
  }

  // 新用户:用默认值,nickname/avatar 等待 onboarding 填
  const created = await prisma.user.create({
    data: {
      wechat_open_id: openId,
      wechat_union_id: unionId,
      // usage_stage / total_sessions 在 schema 里有默认值
    },
  })
  return { user: created, isNewUser: true }
}

/**
 * 通过 id 查 user。鉴权中间件用。
 */
export async function findById(userId: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id: userId } })
}

/** 给前端返的统一 profile 形状(不含敏感字段)*/
export interface UserPublicProfile {
  id: string
  nickname: string | null
  avatar_url: string | null
  gender: User['gender']
  birth_year: number | null
  city: string | null
  usage_stage: User['usage_stage']
  onboarding_completed_at: Date | null
  created_at: Date
}

export function toPublicProfile(user: User): UserPublicProfile {
  return {
    id: user.id,
    nickname: user.nickname,
    avatar_url: user.avatar_url,
    gender: user.gender,
    birth_year: user.birth_year,
    city: user.city,
    usage_stage: user.usage_stage,
    onboarding_completed_at: user.onboarding_completed_at,
    created_at: user.created_at,
  }
}

export interface UpdateProfileInput {
  nickname?: string
  avatar_url?: string | null
  gender?: User['gender']
  birth_year?: number | null
  city?: string | null
}

/**
 * 更新用户 profile;若 nickname 非空且 onboarding_completed_at 仍为 null,
 * 则自动标记 onboarding 完成(spec-018:昵称必填,填了就算走完流程)
 */
export async function updateProfile(
  userId: string,
  patch: UpdateProfileInput,
): Promise<User> {
  const current = await prisma.user.findUnique({ where: { id: userId } })
  if (!current) throw new Error('用户不存在')

  const data: import('@prisma/client').Prisma.UserUpdateInput = { ...patch }

  // nickname 设置且尚未完成 onboarding → 标记完成
  // (允许后续重新编辑 nickname,不会重复触发)
  const newNickname = patch.nickname ?? current.nickname
  if (newNickname && newNickname.trim().length > 0 && !current.onboarding_completed_at) {
    data.onboarding_completed_at = new Date()
  }

  return prisma.user.update({ where: { id: userId }, data })
}
