# spec-016: admin 对话查阅器

> 创建日期: 2026-05-09
> 状态: 已实施(P0 完成)
> 关联 commits: 61f06e1 / 24a28f2
> 归档日期: 2026-05-10

## 1. 背景 / 动机

Sam 痛点:用户跟 AI 对话散在 messages 表,运营按反馈追溯上下文 / 校验 AI 效果没办法。调研 LangSmith / Langfuse / Helicone / Phoenix 共识:左右栏 Inspector + trace metadata 关联。同时 commit 24a28f2 修了关键 bug:之前所有对话只在前端 Pinia,messages 表是空的,导致 admin 看到"0 条消息但 X 次反馈"的矛盾。

## 2. 实施了什么

- **关系 overview**:消息数 / 最后活跃 / dislike count / 红线 count / persona fail count
- **左右栏 Inspector**:左 timeline + 角色筛选 + 只看异常,右 detail(完整内容 + AI metadata + 反馈卡 + 红线卡)
- **fuzzy 关联**:±90s 时间窗口关联 AiCallLog / PromptFeedback / ModerationLog(因 prompt_feedback.message_id 是前端 streaming id ≠ messages.id,M2 改 streaming_id 映射)
- **关系扁平视图**:listAllRelationshipsForAdmin,排序键 updated/messages/dislikes/persona_fail/created
- **看对话落 audit**(view_conversation_messages)
- **修 bug**:conversation.route.ts 把 user/laoke 消息真落库到 messages 表

## 3. 关键文件

**后端**:
- `apps/api/src/services/admin/admin-conversation.service.ts`(getRelationshipOverview / listRelationshipMessages / listAllRelationshipsForAdmin)
- `apps/api/src/routes/v1/admin/conversation.route.ts`
- `apps/api/src/routes/v1/conversation.route.ts`(补落库)

**前端 admin**:
- `apps/admin/app/(dashboard)/conversations/[relationshipId]/page.tsx`(443 行 Inspector)
- `apps/admin/app/(dashboard)/relationships/page.tsx`(扁平视图)

## 4. 入口 / 验证

- API: `GET /v1/admin/relationships/:id/overview` / `GET /v1/admin/relationships/:id/messages`
- Admin: `/relationships` 选一段 → `/conversations/[id]` 看对话
- 验证:用户发一句 → admin 详情页选关系 → 看到对话内容 + AI metadata

## 5. 已知遗留

- "加入 eval 集" / "写笔记" 操作单条消息 — M2
- LLM 摘要 / 翻车主题聚类 — M2
- streaming_id ↔ messages.id 精确映射 — M2
