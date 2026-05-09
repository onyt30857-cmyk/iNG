# spec-002: 微信一键登录

> 创建日期: 2026-05
> 优先级: P0
> 预计工作量: 2-3 天
> 依赖: spec-001

---

## 1. 这是什么

实现微信一键登录。用户点击登录页的"微信一键登录"按钮 → 调用 `uni.login` 获取 code → 后端用 code 换取 openid → 创建或更新 user 记录 → 签发 JWT token → 返回前端。

新用户跳转 onboarding,老用户跳转主页。

---

## 2. 为什么做

用户必须登录后才能使用所有核心功能。微信登录是国内 App 的标准做法,免去用户手动注册的麻烦。

---

## 3. 详细需求

### 3.1 必须实现

#### 前端

- [ ] 登录页 `pages/auth/login.vue` 完整实现(参考 `04-design/pages.md` §3)
- [ ] 微信登录按钮(Primary Large)
- [ ] 点击按钮:
  - 显示 loading 态
  - 调用 `uni.login({ provider: 'weixin' })` 获取 code
  - 把 code POST 到 `/v1/auth/wechat/login`
  - 收到 token 存 storage,通过 `stores/user.ts` 设置
  - 根据 `is_new_user` 跳转 onboarding 或 home
- [ ] 错误处理:
  - 用户拒绝授权:不弹窗,只重置按钮态
  - 网络错误:展示"网络好像有点问题,再试一次"
  - 后端错误:展示后端返回的友好 message
- [ ] 用户协议和隐私政策链接(占位)

#### 后端

- [ ] `apps/api/src/services/wechat/wechat.client.ts`:
  - `getAccessTokenByCode(code)` - 用 code 换 openid 和 session_key
  - 调用 `https://api.weixin.qq.com/sns/oauth2/access_token`
  - 错误处理 + 重试 1 次
- [ ] `apps/api/src/services/user/user.service.ts`:
  - `findOrCreateByWechatOpenId(openId, unionId?)` 
  - 新用户:初始化 `usage_stage = NEWBIE`, `total_sessions = 0`
- [ ] `apps/api/src/lib/jwt.ts`:
  - `signAccessToken(userId)` - 7 天有效
  - `signRefreshToken(userId)` - 30 天有效
  - `verifyToken(token)` - 验证并返回 payload
- [ ] `apps/api/src/routes/v1/auth.route.ts`:
  - `POST /v1/auth/wechat/login` 实现
  - `POST /v1/auth/refresh` 实现
  - `POST /v1/auth/logout`(暂时只把 token 加黑名单 / 让前端清 storage)
- [ ] 配置:微信 appid 和 appsecret 通过环境变量

#### 中间件

- [ ] `apps/api/src/middleware/auth.ts`:
  - 检查 `Authorization: Bearer <token>` header
  - 验证 token,挂 `request.user = { id, ... }`
  - 失败抛 `AppError('AUTH_REQUIRED', 401)` 或 `AppError('TOKEN_EXPIRED', 401)`
- [ ] `/v1/hello` 端点不需要鉴权,但其他业务端点都要

### 3.2 必须不实现

- ❌ 账号密码登录
- ❌ 手机号登录
- ❌ Apple 登录(M2)
- ❌ 注销账号(在另一个 spec)

### 3.3 边界情况

- 微信授权超时(15 秒):前端展示"网络好像有点问题"
- 用户在登录中途退出 App:不需要清理(下次重新登录)
- code 重复使用:微信会返回错误,后端透传

---

## 4. 输入输出

### POST /v1/auth/wechat/login

详见 `02-architecture/api-design.md` §1。

### POST /v1/auth/refresh

详见 `api-design.md`。

### 数据库变更

无新增表(users 表已在 spec-001 创建)。

---

## 5. 关联文件

### 新建

- `apps/api/src/services/wechat/wechat.client.ts`
- `apps/api/src/services/user/user.service.ts`
- `apps/api/src/lib/jwt.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/routes/v1/auth.route.ts`
- `apps/mobile/api/auth.api.ts`
- `apps/mobile/utils/storage.ts`
- `apps/mobile/types/user.ts`

### 修改

- `apps/mobile/pages/auth/login.vue`
- `apps/mobile/stores/user.ts`
- `apps/api/src/server.ts`(注册新路由)

---

## 6. 测试用例

### Case 1: 新用户首次登录

输入: 有效 code (新微信账号)

预期:
- 数据库新建 users 记录
- 返回 `{ user: {...}, token, refresh_token }`
- `is_new_user: true`
- 前端跳 onboarding

### Case 2: 已登录用户重复登录

输入: 同一微信账号的 code

预期:
- 数据库不新建,返回现有 user
- `is_new_user: false`
- 前端跳主页

### Case 3: 微信 API 失败

输入: 无效 code

预期:
- 后端返回 400 + `WECHAT_AUTH_FAILED`
- 前端展示 "微信授权失败,请重试"

### Case 4: token 过期后调业务接口

输入: 过期 token + GET /v1/users/me

预期:
- 后端返回 401 + `TOKEN_EXPIRED`
- 前端自动用 refresh_token 换新 token,重试
- 都失败则跳登录页

### Case 5: 完整链路 E2E

打开 App → 启动页 → 跳到登录 → 点登录 → 跳 onboarding(新用户)→ 完成 onboarding → 跳主页

---

## 7. 验收标准

- [ ] 真机能用微信登录
- [ ] 登录后 storage 里有 token
- [ ] 重启 App 仍然登录
- [ ] 新用户进 onboarding,老用户进主页
- [ ] 错误提示符合老白文案规范
- [ ] 无 hardcode 配置
- [ ] 测试覆盖核心 service

---

## 8. 给 Claude 的额外提示

1. **微信开放平台审核**:Sam 需要先去 https://open.weixin.qq.com 申请应用,拿到 appid + appsecret。这部分 Sam 操作。
2. **iOS 微信 SDK** 集成需要在 manifest.json 配置,Claude 写代码时注意这部分
3. **uni-app 不同平台 uni.login 行为不一样**:
   - iOS/Android:返回 code,然后后端换 openid
   - H5:无法直接微信登录,M1 H5 端可以暂时禁用登录(只展示页面),或者用扫码登录
4. **小程序登录是另一套**(M2 才做)
5. **测试时**:用 Sam 自己的微信测,如果有多个测试账号,每个测试 case 用不同账号

---

## 9. 实施流程

```
Day 1 上午: jwt.ts + auth middleware + Wechat client
Day 1 下午: auth.route.ts + user.service.ts + 集成测试
Day 2 上午: 前端 login.vue + auth.api.ts + storage
Day 2 下午: 联调 + 错误处理 + 真机测试
Day 3:    Sam 验收 + 改 bug + 加测试
```
