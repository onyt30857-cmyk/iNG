// Admin 操作审计落库(spec-011 §7.3 不变式守护)
//
// Phase B 简化版:提供函数式 API,handler 内主动调。
// Phase C+ 真有"在 service 深层做 audit"需求时再加 AsyncLocalStorage。
//
// 设计原则:
// - 永远不抛错(audit 失败不能阻塞业务)
// - 失败只 logger.warn,不影响响应
// - before/after 自动深拷贝(防止后续修改污染)

import type { FastifyRequest } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'

export interface AdminAuditEntry {
  /** 例:"admin_login_success", "view_user_detail", "approve_refund", "execute_deletion", "reveal_prompt" */
  action: string
  /** 例:"admin_user", "user", "subscription", "moderation_log" */
  target_type: string
  target_id: string
  /** 修改类操作必填,读类操作 null */
  before?: unknown
  after?: unknown
  /** critical 操作必填(force_delete / approve_refund 等) */
  reason?: string
  /** 调用方覆盖默认 IP 抓取(从 request 抓的可能是反向代理 IP) */
  ip?: string
}

/**
 * 落 admin_audit_logs。永不抛。
 * adminId 通常从 request.admin?.id 拿;可显式传入(login 成功时还没 request.admin)
 */
export async function recordAdminAudit(
  adminId: string,
  entry: AdminAuditEntry,
  request?: FastifyRequest,
): Promise<void> {
  try {
    const ip = entry.ip ?? request?.ip ?? null

    await prisma.adminAuditLog.create({
      data: {
        admin_user_id: adminId,
        action: entry.action,
        target_type: entry.target_type,
        target_id: entry.target_id,
        before: entry.before === undefined
          ? undefined
          : JSON.parse(JSON.stringify(entry.before)),
        after: entry.after === undefined
          ? undefined
          : JSON.parse(JSON.stringify(entry.after)),
        reason: entry.reason ?? null,
        ip,
      },
    })
  } catch (err) {
    // audit 失败不能阻塞业务,但要让运维感知到
    logger.warn(
      {
        event: 'admin_audit.failed',
        admin_id: adminId,
        action: entry.action,
        target_type: entry.target_type,
        target_id: entry.target_id,
        err: err instanceof Error ? err.message : String(err),
      },
      'admin_audit_logs 落库失败(已忽略,不影响业务)',
    )
  }
}
