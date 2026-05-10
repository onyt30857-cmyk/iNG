# spec-020: 错误码字典 + admin 自助查询

> 创建日期: 2026-05-09
> 状态: 已实施(字典完成),实时流为 spec-020 后续(commit 93536c7)
> 关联 commits: 42d4494 / 93536c7
> 归档日期: 2026-05-10

## 1. 背景 / 动机

Sam 看到"网络层失败:TypeError xxx"出戏。根因:前端把技术 error message 直接拼给用户。需要 10 个固定代号字典 + 老白人格友好文案,运营客服 / 用户报错时能对照查。

## 2. 实施了什么

- **mobile error-codes 工具**:10 个 ErrorCode(NW01/NW02/AU01/AU02/QU01/RL01/AI01/SV01/PM01/UN01),每条带 user_message + internal_description + troubleshoot
- **classifyError(err)**:根据 HTTP status / 关键词推断代号
- **userFacingError(err)** 返"友好话 · 代号 NW01" 格式;conversation.vue / stores/conversation.ts 全部改用
- **admin /errors 静态字典页**:7 类着色(网络/鉴权/配额/内容/AI/系统/其他),搜代号 / 用户文案 / 内部描述
- **admin /errors 实时流 Tab**(commit 93536c7):字典 + 实时双 Tab(实时流读 ai_call_logs 等)
- **字典 hardcoded 不走 DB**:错误码是工程决策,运营不该改

## 3. 关键文件

**前端 mobile**:
- `apps/mobile/utils/error-codes.ts`(10 个 ErrorCode + classifyError)
- `apps/mobile/pages/relationship/conversation.vue`(改用 userFacingError)
- `apps/mobile/stores/conversation.ts`

**前端 admin**:
- `apps/admin/app/(dashboard)/errors/page.tsx`(字典 + 实时双 Tab)
- `apps/admin/components/dashboard/sidebar.tsx`(加入口)

## 4. 入口 / 验证

- Mobile: 触发网络错 → 看到"老白这边线断了 · 代号 NW01"
- Admin: `/errors` Tab 1 字典 / Tab 2 实时
- 验证:断网发消息 → 用户看到友好文案

## 5. 已知遗留

- 引导:"想查具体某次错误细节 → 去 ai_call_logs + Sentry"
