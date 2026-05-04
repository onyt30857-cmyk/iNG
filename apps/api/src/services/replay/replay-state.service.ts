// 复盘状态机 driver - spec-005 §3.1 持久化层
//
// 包装 XState actor,在每次 send 事件时:
//   1. 从 db sessions 表 hydrate state value + state_context
//   2. 创建 XState actor 注入 snapshot
//   3. send 事件,拿新 snapshot
//   4. 写回 db (sessions.state + sessions.state_context)
//
// 关键安全:每次操作都校验 (user_id, session_id),复用 session.service.getSessionById。

import { createActor } from 'xstate'
import type { Session, SessionState } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError, ErrorCodes } from '../../lib/error.js'
import { getSessionById, updateSession } from '../session/session.service.js'
import {
  replayMachine,
  initialReplayContext,
  type ReplayContext,
  type ReplayEvent,
} from '../../state-machines/replay.machine.js'

export interface ReplaySnapshot {
  state: SessionState
  context: ReplayContext
  is_final: boolean
}

/**
 * 把 session 行还原成 XState 可消费的 snapshot 形态。
 * sessions.state_context JSON 必须是 ReplayContext 形状(由本 driver 保证)。
 */
function buildSnapshotFromSession(session: Session): {
  value: SessionState
  context: ReplayContext
} {
  const ctx = (session.state_context ?? {}) as Partial<ReplayContext>
  // 老数据(spec-004 创建的 session)没有 ReplayContext 字段,用 init 补齐
  const filled: ReplayContext = {
    session_id: session.id,
    user_id: session.user_id,
    relationship_id: session.relationship_id,
    parsing: ctx.parsing ?? null,
    reflecting_questions: ctx.reflecting_questions ?? [],
    reflection_answers: ctx.reflection_answers ?? [],
    short_answer_warned: ctx.short_answer_warned ?? false,
    diagnosing: ctx.diagnosing ?? null,
    crisis_detected: ctx.crisis_detected ?? false,
    planning: ctx.planning ?? null,
    drafting: ctx.drafting ?? null,
    selected_reply_id: ctx.selected_reply_id ?? null,
    history: ctx.history ?? [],
  }
  return { value: session.state, context: filled }
}

/**
 * 加载 session 当前状态(spec-005 §3.5 中途恢复)。
 */
export async function loadReplaySnapshot(
  userId: string,
  sessionId: string,
): Promise<ReplaySnapshot> {
  const session = await getSessionById(userId, sessionId)
  const { value, context } = buildSnapshotFromSession(session)
  return {
    state: value,
    context,
    is_final: value === 'CLOSED',
  }
}

/**
 * 触发状态机事件,持久化新状态。
 * 如果当前已经是 final 状态,拒绝继续触发。
 */
export async function sendReplayEvent(
  userId: string,
  sessionId: string,
  event: ReplayEvent,
): Promise<ReplaySnapshot> {
  const session = await getSessionById(userId, sessionId)

  if (session.state === 'CLOSED') {
    throw new AppError({
      code: ErrorCodes.VALIDATION_ERROR,
      message: '这次复盘已经结束了',
      statusCode: 409,
      detail: `session is ${session.state}`,
    })
  }

  const actor = createActor(replayMachine, {
    input: {
      session_id: session.id,
      user_id: session.user_id,
      relationship_id: session.relationship_id,
    },
    snapshot: {
      ...replayMachine.resolveState({
        value: session.state,
        context: buildSnapshotFromSession(session).context,
      }),
    } as ReturnType<typeof replayMachine.resolveState>,
  })

  actor.start()

  // 校验事件能否在当前状态触发
  const before = actor.getSnapshot()
  if (!before.can(event)) {
    actor.stop()
    throw new AppError({
      code: ErrorCodes.VALIDATION_ERROR,
      message: '现在不是做这件事的时候',
      statusCode: 409,
      detail: `cannot send ${event.type} from state ${session.state}`,
    })
  }

  actor.send(event)
  const after = actor.getSnapshot()
  actor.stop()

  const newState = after.value as SessionState
  const newContext = after.context

  // 持久化:state + state_context + closed_at(进 final 状态时)
  const updated = await updateSession(userId, sessionId, {
    state: newState,
    state_context: newContext,
    ...(after.status === 'done' ? { closed_at: new Date() } : {}),
  })

  // 危机信号:同步写到 sessions.crisis_triggered(spec-005 §3.3)
  // 这是 db 列,用 prisma 直接更新(不走 updateSession 因为 service schema 没暴露此字段)
  if (newContext.crisis_detected && !session.crisis_triggered) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { crisis_triggered: true },
    })
  }

  return {
    state: updated.state,
    context: newContext,
    is_final: after.status === 'done',
  }
}

/**
 * 在已有 session 上初始化 replay context(M1: spec-004 创建的 session 没有 context,
 * 第一次进入 replay 时调一下补齐)。
 */
export async function initReplayContextIfNeeded(
  userId: string,
  sessionId: string,
): Promise<void> {
  const session = await getSessionById(userId, sessionId)
  const ctx = (session.state_context ?? {}) as Partial<ReplayContext>
  if (ctx.session_id) return // 已经初始化过

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      state_context: initialReplayContext({
        session_id: session.id,
        user_id: session.user_id,
        relationship_id: session.relationship_id,
      }) as never,
    },
  })
}
