// dev 阶段过渡用 JWT
//
// 来源:apps/api 跑 `pnpm seed-dev` 后输出的 access token(7 天有效)。
// 一旦过期,重新 seed-dev 后把新 token 贴回这里。
//
// spec-002 微信登录真接入后,这个文件就废弃,token 从 stores/user.ts
// 走真登录流程拿到并存 storage。

export const DEV_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXYtdXNlci0xIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc3ODA0NDA3OCwiZXhwIjoxNzgwNjM2MDc4fQ.VUfpEVpAoRn2hXbewLxMiEi2Z49cmKGN4jivvCcBaYE'

// seed-dev 创建的固定 dev 数据 ID
export const DEV_USER_ID = 'dev-user-1'
export const DEV_RELATIONSHIP_ID = 'dev-relationship-1' // 小雨(legacy 名,保留兼容)
export const DEV_RELATIONSHIP_IDS = [
  'dev-relationship-1', // 小雨
  'dev-relationship-2', // 小美
  'dev-relationship-3', // 玲玲
] as const
export const DEV_SESSION_ID = 'dev-session-1'
