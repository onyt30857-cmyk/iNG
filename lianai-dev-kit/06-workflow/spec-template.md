# Spec 模板

> 用法:每次开发新功能前,复制本模板,填写完整,放到 `05-specs/spec-XXX-feature-name.md`。
>
> Spec 是 Claude 一次开发任务的完整输入。质量决定 Claude 产出的质量。

---

# spec-XXX: [功能名称]

> 创建日期: YYYY-MM-DD
> 优先级: P0 / P1 / P2
> 预计工作量: X 天
> 依赖 spec: spec-YYY (如有)

---

## 1. 这是什么

一段话(2-4 句)说清楚要做什么。让一个不熟悉项目的人读完知道这个功能要解决什么问题。

例子:
> 实现微信一键登录。用户点击登录页的"微信一键登录"按钮 → 调用 uni.login 获取 code → 后端用 code 换取 openid 和 session_key → 创建或更新 user 记录 → 签发 JWT token → 返回给前端。

---

## 2. 为什么做

- 这个功能解决用户的什么问题?
- 不做会怎样?
- 它在产品的什么位置(Week X 的一部分?某个用户故事的子任务?)?

例子:
> 用户必须登录后才能使用所有核心功能。微信登录是国内 App 的标准做法,免去用户手动注册的麻烦。这是 Week 2 的核心交付,后续所有功能都依赖它。

---

## 3. 详细需求

### 3.1 必须实现

清单形式列出所有必须实现的细节。颗粒度要细到 Claude 能直接照着写。

例子:
- [ ] 前端:登录页有一个微信登录按钮,符合 design-system 的 Primary 大按钮规格
- [ ] 前端:点击按钮调用 `uni.login` 获取 code
- [ ] 前端:把 code 发给后端 `POST /auth/wechat/login`
- [ ] 前端:收到 token 后存到 storage,跳转主页
- [ ] 前端:onboarding 未完成的用户,跳转到首次引导页
- [ ] 后端:实现 `POST /auth/wechat/login` 端点(详见 api-design.md)
- [ ] 后端:用 code 调用微信 API 换 openid 和 session_key
- [ ] 后端:根据 openid 创建或更新 user 记录(`is_new_user` 字段判断)
- [ ] 后端:签发 JWT token(有效期 7 天)+ refresh token(30 天)
- [ ] 后端:把微信 appid、appsecret 配置到环境变量,**不提交到代码**
- [ ] 后端:微信调用失败时返回 `WECHAT_AUTH_FAILED` 错误码

### 3.2 必须不实现

明确说不做的事,防止 Claude 越界。

例子:
- ❌ 不做账号密码登录(M1 只支持微信)
- ❌ 不做手机号登录(M2)
- ❌ 不做 Apple 登录(M2)
- ❌ 不做注销逻辑(在另一个 spec 里)

### 3.3 边界情况

例子:
- 微信授权超时:前端给"网络好像有点问题,再试一次"提示
- 用户拒绝授权:前端 catch error,什么也不做(不弹窗骚扰)
- 后端微信 API 失败:返回 503,前端提示"登录服务暂时不可用,请稍后再试"
- code 重复使用:后端返回 400 + 提示

---

## 4. 输入输出

### 4.1 API 接口

如果涉及 API,完整定义:URL、方法、参数、返回。

例子:

#### POST /api/v1/auth/wechat/login

Request:
```json
{
  "code": "string,必填,长度约 30"
}
```

Response (成功):
```json
{
  "ok": true,
  "data": {
    "user": { /* User 对象 */ },
    "token": "JWT string",
    "refresh_token": "JWT string"
  }
}
```

Response (失败):
```json
{
  "ok": false,
  "error": {
    "code": "WECHAT_AUTH_FAILED",
    "message": "微信授权失败,请重试"
  }
}
```

### 4.2 数据库变更

如果涉及数据库:新增表/字段/索引/约束。

例子:
- 新建 `users` 表(详见 database-schema.prisma)
- 索引:`(wechat_open_id) UNIQUE`

### 4.3 UI 变更

哪些页面、什么交互、参考 design-system 的哪些组件。

例子:
- 修改 `pages/auth/login.vue`:增加微信登录按钮(Primary Large 规格)
- 加载状态:Button 变 Loading 态
- 成功后:跳转 `pages/home/index` 或 `pages/onboarding/index`

---

## 5. 关联文件

### 5.1 受影响的现有文件

- `apps/mobile/pages/auth/login.vue`
- `apps/mobile/api/auth.api.ts`
- `apps/mobile/stores/user.ts`
- `apps/api/src/routes/v1/auth.route.ts`
- `apps/api/src/services/user/user.service.ts`

### 5.2 需要新建的文件

- `apps/api/src/services/wechat/wechat.client.ts`
- `apps/api/src/lib/jwt.ts`(如果还没有)
- `apps/mobile/utils/storage.ts`(如果还没有)

---

## 6. 测试用例

列出 3-5 个具体的输入输出对,作为验收标准。

例子:

### Case 1: 新用户第一次登录

输入:
- code: "valid_code_xxx"

预期:
- 数据库新建 users 记录
- `is_new_user: true`
- 返回 token 和 refresh_token
- 前端跳转 onboarding

### Case 2: 已登录用户重复登录

输入:
- code: "valid_code_yyy" (用同一个微信账号)

预期:
- 数据库查到现有 user(不新建)
- `is_new_user: false`
- 返回新的 token
- 前端跳转主页

### Case 3: 微信 API 失败

输入:
- code: "invalid_code"

预期:
- 后端返回 400 + `WECHAT_AUTH_FAILED`
- 前端不跳转,展示错误提示

### Case 4: 网络超时

输入:
- code: "valid_code" 但微信 API 超时

预期:
- 后端在 5 秒内返回 503
- 前端展示"网络好像有点问题"

---

## 7. 验收标准

### 7.1 功能层面

- [ ] 用户能用微信登录
- [ ] 新用户进 onboarding,老用户进主页
- [ ] token 在 storage 持久化
- [ ] App 重启后仍然登录
- [ ] 网络异常有友好提示

### 7.2 性能层面

- [ ] 登录从点击到主页 < 3 秒(常规网络)
- [ ] API 中位响应 < 500ms

### 7.3 兼容性

- [ ] iOS 14+
- [ ] Android 8+
- [ ] H5 在主流浏览器

### 7.4 代码质量

- [ ] 单元测试覆盖 wechat.client.ts 和 user.service.ts
- [ ] 集成测试覆盖 /auth/wechat/login
- [ ] 无 hardcode 配置(微信 appid/secret 在环境变量)
- [ ] 错误用 AppError 统一处理
- [ ] 注释中文,符合 CLAUDE.md 规范

---

## 8. 给 Claude 的额外提示(可选)

如果有特殊提醒,写在这里。例:

> Claude 注意:
> 1. 微信小程序和 App 的登录 API 不一样,M1 只做 App 端,小程序的登录推到 M2
> 2. iOS 和安卓的 uni.login 返回字段略有不同,要做兼容
> 3. 第一次开发可能遇到微信开放平台审核,需要提前申请,这部分需要 Sam 操作

---

## 9. 实施流程

按这个顺序让 Claude 做:

1. 先让 Claude 读这份 spec,**不写代码**,列出 tasks 清单
2. Sam 确认 tasks
3. Claude 一个 task 一个 task 实施(每完成一个汇报)
4. Claude 写测试
5. Sam 真机验收
6. 合并到主分支

---

## 10. 完成后更新

完成后:
- [ ] 更新 `06-workflow/dev-guide.md` 的 12 周路线图状态
- [ ] 如果有架构级别的决策修改,更新 `02-architecture/tech-decisions.md`
- [ ] 如果新增了组件,更新 `04-design/design-system.md`
