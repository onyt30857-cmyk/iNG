// 复盘 orchestrator service - PARSING 入口
//
// 把"session 维度的业务"(校验 ownership / 拼装 ParsingInput / 调 ai orchestrator)
// 包成一个干净的 service 函数,给 route 层用。
//
// 关键安全(CLAUDE.md §5.1):
//   - Layer 1 强制:relationshipId 校验 ownership(getRelationshipById 已做)
//   - Layer 3 强制:audit 用"该 user 名下其他 relationship 的 name 列表"

import {
  runParsing,
  type ParsingInput,
  type ParsingMessage,
  type ParsingOutput,
} from '../../ai/orchestrators/parsing.orchestrator.js'
import { getSessionById } from '../session/session.service.js'
import {
  getRelationshipById,
  listRelationships,
} from '../relationship/relationship.service.js'

export interface RunParsingForSessionInput {
  /** OCR 之后的对话消息(spec-004 实施后由后端从 db 拉,目前由前端传) */
  messages: ReadonlyArray<ParsingMessage>
  /** 用户在 ENTRY 阶段填的简短描述 */
  entry_note: string
}

export async function runParsingForSession(
  userId: string,
  sessionId: string,
  input: RunParsingForSessionInput,
): Promise<ParsingOutput> {
  // 1. 校验 session 属于该 user,拿 relationship_id
  const session = await getSessionById(userId, sessionId)

  // 2. 拿当前 relationship(name 用作 prompt 注入)
  const current = await getRelationshipById(userId, session.relationship_id)

  // 3. 拿其他 relationship 名做跨关系审计黑名单
  const others = await listRelationships(userId)
  const otherIdentifiers = others
    .filter((r) => r.id !== current.id)
    .map((r) => r.name)
    .filter((n) => n.trim().length >= 2)

  // 4. 拼 ParsingInput
  const parsingInput: ParsingInput = {
    user_id: userId,
    relationship_id: current.id,
    session_id: session.id,
    relationship_name: current.name,
    entry_note: input.entry_note,
    messages: input.messages,
    other_identifiers: otherIdentifiers,
  }

  // 5. 调 orchestrator
  return runParsing(parsingInput)
}
