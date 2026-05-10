# spec-028: 非编号 spec 归档(billing / stability / 备份码恢复)

> 创建日期: 2026-05-09 ~ 2026-05-10
> 状态: 已实施
> 关联 commits: 24f572e / 7aa270a / 4135e71 / da1ceb8
> 归档日期: 2026-05-10
> 备注: spec-017 / spec-028 编号 git log 无命中,本文用 spec-028 归档"没正式拿编号但已实施"的功能

## 一、Anthropic 余额监控(spec-billing)

> commit: 24f572e

### 背景
Sam 担心 Anthropic 账户余额突然耗完,API 调用全失败用户体验崩。需要主动监控 + 阈值告警。

### 实施
- `apps/api/src/services/anthropic-billing.service.ts` 拉 Anthropic 余额 API
- 5min cache + 阈值 ≤ $20 触发 admin 告警 banner
- admin `apps/admin/components/dashboard/balance-banner.tsx` 全局 banner
- admin `/settings/billing` 页详情 + 充值链接
- 触发 ProductChangelog auto entry

### 验证
余额 ≤ $20 → admin 全局橙色 banner "Claude 余额告急,请充值"

---

## 二、系统稳定性 P0+P1+P2(stability)

> commit: 7aa270a

### 背景
Sam 反馈"用户能看到一堆冷冰冰报错,有时候系统挂了我都不知道"。三个层面治理:
- P0 全局兜底(Sentry / 错误码 / 降级文案)
- P1 健康自检(/health 端点 + admin 健康清单)
- P2 主动埋点(AiCallLog 全量 + 关键链路 timing)

### 实施
- 后端 `/health` endpoint:DB / Redis(虽未真用)/ Anthropic 三个 ping
- 前端 mobile error-codes.ts 11 类错误统一文案(spec-020 字典 + NETWORK_TIMEOUT 兜底)
- AiCallLog 落库改增量索引,M1 量小不分区
- admin 总览健康清单 6 行(见 spec-023)

### 验证
admin `/dashboard` 健康清单 6 行全 ✓ → 系统健康

---

## 三、备份码恢复重构(mobile auth)

> commit: 4135e71 / da1ceb8

### 背景
spec-002 备份码恢复入口埋在"我的"页很深,且老用户回归时 token 失效场景下没引导。需要前置入口 + 已登录状态强警告。

### 实施
- mobile `/auth/login.vue` 入口前置(splash 若 token 失效自动跳)
- 已登录用户去主动恢复 → 二次确认 dialog 警告"会替换当前账户数据"
- `apps/mobile/api/client.ts` 401 → 自动跳 login(silent reauth + 用户提示二选一)
- 备份码失效场景区分"格式错"/"过期"/"已被另一台设备用过"3 类文案

### 验证
用户在 A 设备生成 backup_code → B 设备输入 → 看到"账户从 A 转过来" → A 设备下次启动会被踢出 + 引导新账号

---

## 四、未来可能的 spec 编号

如有新功能,继续 spec-029 起。spec-017 编号已永久空缺(无追溯价值)。
