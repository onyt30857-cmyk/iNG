# 03-prompts/ 是 prompt 设计稿,不是运行时

> 2026-05-10 添加,避免接手人误以为代码在 readFile 这些 .md

## 运行时实际加载顺序

1. **DB**:运营在 admin /prompts 页面创建的版本(`PromptVersion` 表)
2. **inline default**:`apps/api/src/ai/default-prompts.ts`(spec-027 修复)
3. **throw**:都没有就抛错

**注意**:`03-prompts/*.md` 在 prod(Railway)**完全读不到** — Railway 只部署 `apps/api/`,不带 `lianai-dev-kit/` 目录。所以这些 .md 是**人类可读的设计稿**,改动后要同步:

```bash
# 1. 改 .md
# 2. 跑 extract 脚本(如果有,否则手动同步到 default-prompts.ts)
# 3. 或通过 admin /prompts UI 写入 DB(运营友好路径)
```

## 5 个 scene 与 .md 对应

| Scene | .md 文件 | 调用 orchestrator |
|---|---|---|
| `parsing` | `parsing.md` | `ai/orchestrators/parsing.orchestrator.ts` |
| `reflecting` | `reflecting.md` | `ai/orchestrators/reflecting.orchestrator.ts` |
| `diagnosing` | `diagnosing.md` | `ai/orchestrators/diagnosing.orchestrator.ts` |
| `planning` | `planning.md` | `ai/orchestrators/planning.orchestrator.ts` |
| `drafting` | `drafting.md` | `ai/orchestrators/drafting.orchestrator.ts` |
| crisis 兜底 | `crisis.md` | `ai/orchestrators/conversation-turn.orchestrator.ts`(crisis 路径) |
