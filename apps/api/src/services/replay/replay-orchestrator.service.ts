// 复盘 orchestrator service - 5 个状态的入口
//
// 每个 runXxxForSession 函数负责:
//   1. 校验 session 属于该 user(getSessionById,Layer 2 隔离)
//   2. 拿当前 relationship.name(prompt 用)
//   3. 拿同 user 名下其他 relationship.name 列表(跨关系 audit 用)
//   4. 拼对应的 orchestrator input
//   5. 调 ai/orchestrators/runXxx
//
// 关键安全(CLAUDE.md §5.1):
//   Layer 1 强制:relationshipId 校验 ownership(getRelationshipById 已做)
//   Layer 3 强制:audit 用"该 user 名下其他 relationship 的 name 列表"

import {
  runParsing,
  runParsingStream,
  type ParsingInput,
  type ParsingMessage,
  type ParsingOutput,
} from '../../ai/orchestrators/parsing.orchestrator.js'
import type { CallClaudeStreamHandlers } from '../../ai/client.js'
import {
  runReflecting,
  type ReflectingInput,
  type ReflectingOutput,
} from '../../ai/orchestrators/reflecting.orchestrator.js'
import {
  runDiagnosing,
  type DiagnosingInput,
  type DiagnosingOutput,
  type DiagnosingReflection,
} from '../../ai/orchestrators/diagnosing.orchestrator.js'
import {
  runPlanning,
  type PlanningInput,
  type PlanningOutput,
} from '../../ai/orchestrators/planning.orchestrator.js'
import {
  runDrafting,
  type DraftingInput,
  type DraftingOutput,
} from '../../ai/orchestrators/drafting.orchestrator.js'
import { getSessionById } from '../session/session.service.js'
import {
  getRelationshipById,
  listRelationships,
} from '../relationship/relationship.service.js'

interface SessionContext {
  sessionId: string
  relationshipId: string
  relationshipName: string
  otherIdentifiers: string[]
}

/**
 * 5 个 runXxxForSession 共享的上下文加载逻辑。
 * 校验 ownership + 拿名字 + 拿审计黑名单。
 */
async function loadSessionContext(
  userId: string,
  sessionId: string,
): Promise<SessionContext> {
  const session = await getSessionById(userId, sessionId)
  const current = await getRelationshipById(userId, session.relationship_id)
  const others = await listRelationships(userId)
  const otherIdentifiers = others
    .filter((r) => r.id !== current.id)
    .map((r) => r.name)
    .filter((n) => n.trim().length >= 2)

  return {
    sessionId: session.id,
    relationshipId: current.id,
    relationshipName: current.name,
    otherIdentifiers,
  }
}

// =================== PARSING ===================

export interface RunParsingForSessionInput {
  messages: ReadonlyArray<ParsingMessage>
  entry_note: string
}

export async function runParsingForSession(
  userId: string,
  sessionId: string,
  input: RunParsingForSessionInput,
): Promise<ParsingOutput> {
  const ctx = await loadSessionContext(userId, sessionId)
  const parsingInput: ParsingInput = {
    user_id: userId,
    relationship_id: ctx.relationshipId,
    session_id: ctx.sessionId,
    relationship_name: ctx.relationshipName,
    entry_note: input.entry_note,
    messages: input.messages,
    other_identifiers: ctx.otherIdentifiers,
  }
  return runParsing(parsingInput)
}

/** 流式版 runParsingForSession:每个 chunk 给 handlers.onChunk */
export async function runParsingForSessionStream(
  userId: string,
  sessionId: string,
  input: RunParsingForSessionInput,
  handlers: CallClaudeStreamHandlers,
): Promise<ParsingOutput> {
  const ctx = await loadSessionContext(userId, sessionId)
  const parsingInput: ParsingInput = {
    user_id: userId,
    relationship_id: ctx.relationshipId,
    session_id: ctx.sessionId,
    relationship_name: ctx.relationshipName,
    entry_note: input.entry_note,
    messages: input.messages,
    other_identifiers: ctx.otherIdentifiers,
  }
  return runParsingStream(parsingInput, handlers)
}

// =================== REFLECTING ===================

export interface RunReflectingForSessionInput {
  messages: ReadonlyArray<ParsingMessage>
  parsing_output: string
  user_initial_response: string
  scenario_primary?: string | undefined
}

export async function runReflectingForSession(
  userId: string,
  sessionId: string,
  input: RunReflectingForSessionInput,
): Promise<ReflectingOutput> {
  const ctx = await loadSessionContext(userId, sessionId)
  const reflectingInput: ReflectingInput = {
    user_id: userId,
    relationship_id: ctx.relationshipId,
    session_id: ctx.sessionId,
    relationship_name: ctx.relationshipName,
    parsing_output: input.parsing_output,
    user_initial_response: input.user_initial_response,
    messages: input.messages,
    other_identifiers: ctx.otherIdentifiers,
    ...(input.scenario_primary !== undefined
      ? { scenario_primary: input.scenario_primary }
      : {}),
  }
  return runReflecting(reflectingInput)
}

// =================== DIAGNOSING ===================

export interface RunDiagnosingForSessionInput {
  messages: ReadonlyArray<ParsingMessage>
  parsing_output: string
  reflections: ReadonlyArray<DiagnosingReflection>
  scenario_primary?: string | undefined
}

export async function runDiagnosingForSession(
  userId: string,
  sessionId: string,
  input: RunDiagnosingForSessionInput,
): Promise<DiagnosingOutput> {
  const ctx = await loadSessionContext(userId, sessionId)
  const diagnosingInput: DiagnosingInput = {
    user_id: userId,
    relationship_id: ctx.relationshipId,
    session_id: ctx.sessionId,
    relationship_name: ctx.relationshipName,
    parsing_output: input.parsing_output,
    reflections: input.reflections,
    messages: input.messages,
    other_identifiers: ctx.otherIdentifiers,
    ...(input.scenario_primary !== undefined
      ? { scenario_primary: input.scenario_primary }
      : {}),
  }
  return runDiagnosing(diagnosingInput)
}

// =================== PLANNING ===================

export interface RunPlanningForSessionInput {
  messages: ReadonlyArray<ParsingMessage>
  parsing_output: string
  reflections: ReadonlyArray<DiagnosingReflection>
  diagnosing_output: string
}

export async function runPlanningForSession(
  userId: string,
  sessionId: string,
  input: RunPlanningForSessionInput,
): Promise<PlanningOutput> {
  const ctx = await loadSessionContext(userId, sessionId)
  const planningInput: PlanningInput = {
    user_id: userId,
    relationship_id: ctx.relationshipId,
    session_id: ctx.sessionId,
    relationship_name: ctx.relationshipName,
    parsing_output: input.parsing_output,
    reflections: input.reflections,
    diagnosing_output: input.diagnosing_output,
    messages: input.messages,
    other_identifiers: ctx.otherIdentifiers,
  }
  return runPlanning(planningInput)
}

// =================== DRAFTING ===================

export interface RunDraftingForSessionInput {
  messages: ReadonlyArray<ParsingMessage>
  parsing_output: string
  reflections: ReadonlyArray<DiagnosingReflection>
  diagnosing_output: string
  planning_output: string
}

export async function runDraftingForSession(
  userId: string,
  sessionId: string,
  input: RunDraftingForSessionInput,
): Promise<DraftingOutput> {
  const ctx = await loadSessionContext(userId, sessionId)
  const draftingInput: DraftingInput = {
    user_id: userId,
    relationship_id: ctx.relationshipId,
    session_id: ctx.sessionId,
    relationship_name: ctx.relationshipName,
    parsing_output: input.parsing_output,
    reflections: input.reflections,
    diagnosing_output: input.diagnosing_output,
    planning_output: input.planning_output,
    messages: input.messages,
    other_identifiers: ctx.otherIdentifiers,
  }
  return runDrafting(draftingInput)
}
