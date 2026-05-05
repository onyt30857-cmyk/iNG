// Conversation turn service - spec-006 Phase 18.2
//
// 跟 5 个 run-* 端点共享 loadSessionContext 模式,但用 conversation-turn orchestrator。

import {
  runConversationTurn,
  type ConversationTurnInput,
  type ConversationTurnHistoryItem,
  type ConversationTurnOutput,
} from '../../ai/orchestrators/conversation-turn.orchestrator.js'
import type { CallClaudeStreamHandlers } from '../../ai/client.js'
import {
  getRelationshipById,
  listRelationships,
} from '../relationship/relationship.service.js'

export interface RunConversationTurnInput {
  user_text: string
  history: ConversationTurnHistoryItem[]
  /** spec-007 Phase 19.5:老 K"私下看到的"信号 brief,可空 */
  signal_brief?: string | null
}

export async function runConversationTurnForRelationship(
  userId: string,
  relationshipId: string,
  input: RunConversationTurnInput,
  handlers: CallClaudeStreamHandlers,
): Promise<ConversationTurnOutput> {
  // ★ Layer 1 ownership 校验
  const current = await getRelationshipById(userId, relationshipId)
  const others = await listRelationships(userId)
  const otherIdentifiers = others
    .filter((r) => r.id !== current.id)
    .map((r) => r.name)
    .filter((n) => n.trim().length >= 2)

  const turnInput: ConversationTurnInput = {
    user_id: userId,
    relationship_id: current.id,
    relationship_name: current.name,
    history: input.history,
    user_text: input.user_text,
    other_identifiers: otherIdentifiers,
    ...(input.signal_brief ? { signal_brief: input.signal_brief } : {}),
  }
  return runConversationTurn(turnInput, handlers)
}
