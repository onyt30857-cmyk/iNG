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
