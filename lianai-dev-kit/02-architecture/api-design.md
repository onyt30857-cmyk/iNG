# API 接口设计

> 所有 REST API 接口的完整定义。
> 实施时直接按这份文档生成 Fastify routes 和 client 代码。

---

## 通用约定

### Base URL

- 生产: `https://api.lianai.com/v1`
- 测试: `https://api-staging.lianai.com/v1`
- 开发: `http://localhost:3000/v1`

### 鉴权

除 `/auth/*` 外,所有接口需要 `Authorization: Bearer <jwt_token>` header。

### 响应格式

**成功**:
```json
{
  "ok": true,
  "data": { /* 业务数据 */ }
}
```

**失败**:
```json
{
  "ok": false,
  "error": {
    "code": "AUTH_FAILED",
    "message": "登录失效,请重新登录",
    "detail": "token expired"  // 仅 dev/staging 环境
  }
}
```

### HTTP 状态码

- `200` 成功
- `400` 客户端参数错误
- `401` 未鉴权
- `403` 无权限(例:跨用户访问)
- `404` 资源不存在
- `409` 冲突(例:重复创建)
- `429` 限流
- `500` 服务器错误
- `503` 服务不可用(AI 服务故障等)

### 错误码列表

详见 `apps/api/src/lib/error.ts` 中的 `ErrorCodes`。

### 分页

```
GET /api/v1/xxx?page=1&page_size=20
```

返回:
```json
{
  "ok": true,
  "data": {
    "items": [...],
    "page": 1,
    "page_size": 20,
    "total": 87
  }
}
```

### 时间格式

所有时间用 ISO 8601:`2026-05-03T10:30:00.000Z`。

---

## 1. 鉴权 Auth

### POST /auth/wechat/login

微信一键登录。

**Request**:
```json
{
  "code": "wechat_auth_code_here"
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "user_xxx",
      "nickname": "Sam",
      "avatar_url": "https://...",
      "usage_stage": "NEWBIE",
      "is_new_user": true
    },
    "token": "eyJhbGc...",
    "refresh_token": "eyJhbGc..."
  }
}
```

### POST /auth/refresh

刷新 token。

**Request**:
```json
{
  "refresh_token": "eyJhbGc..."
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "token": "eyJhbGc...",
    "refresh_token": "eyJhbGc..."
  }
}
```

### POST /auth/logout

退出登录(让 token 失效)。

**Response**: `200 OK`

---

## 2. 用户 User

### GET /users/me

获取当前登录用户信息。

**Response**:
```json
{
  "ok": true,
  "data": {
    "id": "user_xxx",
    "nickname": "Sam",
    "avatar_url": "https://...",
    "gender": "MALE",
    "birth_year": 1995,
    "city": "上海",
    "usage_stage": "NEWBIE",
    "total_sessions": 3,
    "subscription": {
      "plan": "MONTHLY",
      "status": "ACTIVE",
      "expires_at": "2026-06-03T00:00:00Z"
    },
    "created_at": "2026-04-01T10:00:00Z"
  }
}
```

### PATCH /users/me

更新当前用户信息。

**Request**:
```json
{
  "nickname": "新昵称",
  "gender": "MALE",
  "birth_year": 1995,
  "city": "上海"
}
```

**Response**: 更新后的用户信息

### POST /users/me/onboarding

提交首次引导的 3 个问题答案。

**Request**:
```json
{
  "question_1_answer": "有点凉",
  "question_2_answer": "她回了一条不知道怎么接的话",
  "nickname": "Sam"
}
```

**Response**: 更新后的用户信息

---

## 3. 关系档案 Relationship

### GET /relationships

获取当前用户的所有关系档案列表。

**Query Params**:
- `archived` (boolean) - 是否包含已归档的,默认 false
- `page`, `page_size`

**Response**:
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "rel_xxx",
        "name": "小雨",
        "stage": "FLIRTING",
        "avatar_seed": "yu_2024",
        "last_session_at": "2026-04-30T20:15:00Z",
        "session_count": 8,
        "archived": false,
        "created_at": "2026-04-01T10:00:00Z"
      }
    ],
    "page": 1,
    "page_size": 20,
    "total": 3
  }
}
```

### POST /relationships

创建一个新关系档案。

**Request**:
```json
{
  "name": "小雨",
  "stage": "FLIRTING",
  "basic_facts": {
    "how_met": "朋友介绍",
    "first_met_at": "2024-03",
    "key_facts": ["喜欢爵士乐", "在上海读研"]
  },
  "user_reminders": [
    "她最近在写论文,压力大"
  ]
}
```

**Response**: 创建的 relationship 对象

### GET /relationships/:id

获取一个关系档案的详情。

**Response**:
```json
{
  "ok": true,
  "data": {
    "id": "rel_xxx",
    "name": "小雨",
    "stage": "FLIRTING",
    "basic_facts": { /* ... */ },
    "user_reminders": [ /* ... */ ],
    "observations": [
      {
        "id": "obs_xxx",
        "observation_text": "她不喜欢被催着回消息",
        "confidence": 0.8,
        "user_disputed": false,
        "promoted": true,
        "created_at": "2026-04-15T20:00:00Z"
      }
    ],
    "assertions": [
      {
        "id": "ast_xxx",
        "assertion_text": "她需要更多空间和缓冲时间",
        "confidence": 0.85,
        "priority": 80
      }
    ],
    "session_count": 8,
    "last_session_at": "2026-04-30T20:15:00Z",
    "created_at": "2026-04-01T10:00:00Z"
  }
}
```

### PATCH /relationships/:id

更新关系档案。

**Request**: 任何字段子集

**Response**: 更新后的 relationship 对象

### POST /relationships/:id/archive

归档关系。

**Response**: `200 OK`

### POST /relationships/:id/unarchive

取消归档。

**Response**: `200 OK`

### DELETE /relationships/:id

删除关系档案(软删除,30 天后真删)。

**Response**: 
```json
{
  "ok": true,
  "data": {
    "deletion_log_id": "del_xxx",
    "execute_at": "2026-06-03T10:00:00Z"
  }
}
```

### PATCH /relationships/:id/observations/:obs_id

修正某条 observation(用户标记不准)。

**Request**:
```json
{
  "user_disputed": true,
  "user_dispute_note": "其实她是当时在加班"
}
```

**Response**: 更新后的 observation

### DELETE /relationships/:id/observations/:obs_id

删除某条 observation。

**Response**: `200 OK`

### GET /relationships/overview

多线全景视图。

**Response**:
```json
{
  "ok": true,
  "data": {
    "active_relationships": [
      {
        "id": "rel_xxx",
        "name": "小雨",
        "stage": "FLIRTING",
        "last_session_at": "2026-04-30T20:15:00Z",
        "days_since_last_session": 3
      }
    ]
  }
}
```

注意:overview 接口返回的字段克制,**不包含**:
- 跨关系比较
- 兴趣度评分
- 任何评判性字段

---

## 4. 复盘会话 Replay

### POST /replay/start

开始一次新的复盘会话。

**Request**:
```json
{
  "relationship_id": "rel_xxx",
  "screenshot_urls": [
    "https://oss.lianai.com/screenshots/xxx_1.jpg",
    "https://oss.lianai.com/screenshots/xxx_2.jpg"
  ],
  "entry_note": "她两天没回我了"  // 可选
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "session_id": "sess_xxx",
    "state": "PARSING",
    "stream_url": "/replay/sess_xxx/stream"  // SSE 端点
  }
}
```

后端立刻在 background 启动:
1. OCR 识别截图
2. 场景分类
3. PARSING 状态的 AI 生成

### GET /replay/:session_id/stream (SSE)

订阅会话的流式输出。

**Response**: Server-Sent Events

```
event: state_change
data: {"state": "PARSING"}

event: message_chunk
data: {"role": "LAOKE", "delta": "我看了下"}

event: message_chunk
data: {"role": "LAOKE", "delta": "你们这段。"}

event: message_complete
data: {"role": "LAOKE", "message_id": "msg_xxx", "full_text": "..."}

event: state_change
data: {"state": "REFLECTING", "questions": ["...", "...", "..."]}

event: ping
data: {}
```

### GET /replay/:session_id

获取会话的完整状态(刷新页面后恢复)。

**Response**:
```json
{
  "ok": true,
  "data": {
    "id": "sess_xxx",
    "state": "REFLECTING",
    "messages": [...],
    "reflections": [...],
    "generated_replies": [...],
    "started_at": "2026-04-30T20:15:00Z",
    "closed_at": null
  }
}
```

### POST /replay/:session_id/reflect

提交 REFLECTING 阶段的用户回答。

**Request**:
```json
{
  "question_index": 0,
  "answer": "我最在意她那句「最近忙」,因为感觉是借口。"
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "saved": true,
    "next_question_index": 1,
    "all_answered": false
  }
}
```

3 个问题全答完后,自动进入 DIAGNOSING(SSE 流推过来)。

### POST /replay/:session_id/plan-choice

PLANNING 阶段后,用户选择。

**Request**:
```json
{
  "choice": "TRY"  // "TRY" / "POSTPONE" / "OTHER_IDEA"
}
```

**Response**: 触发下一阶段或退出

### POST /replay/:session_id/draft-mode

DRAFTING 阶段的入口分流。

**Request**:
```json
{
  "mode": "ORGANIZE"  // ORGANIZE / NEED_HELP / REVIEW_MINE / SKIP
  // ORGANIZE: 我大概知道想说啥,帮我组织
  // NEED_HELP: 我不知道想说啥,先帮我想想
  // REVIEW_MINE: 我写了一版你帮我看看
  // SKIP: 今晚不发,先这样
}
```

**Request body** (REVIEW_MINE 时):
```json
{
  "mode": "REVIEW_MINE",
  "user_draft": "我写的版本..."
}
```

**Response**: 触发 AI 生成话术(SSE 流)

### POST /replay/:session_id/select-reply

用户选了某张话术卡片。

**Request**:
```json
{
  "reply_id": "reply_xxx"
}
```

**Response**: `200 OK`

### POST /replay/:session_id/refine

用户对选中的话术做调整(自然语言追问)。

**Request**:
```json
{
  "reply_id": "reply_xxx",
  "instruction": "再温柔一点,把'你'换成'宝'"
}
```

**Response**: 触发 AI 生成调整后的版本(SSE 流)

### POST /replay/:session_id/copy

用户复制了话术(埋点)。

**Request**:
```json
{
  "reply_id": "reply_xxx"
}
```

**Response**: `200 OK`

### POST /replay/:session_id/close

关闭会话(进入 CLOSED 状态)。

**Request**:
```json
{
  "follow_up": "REMIND_3_DAYS"  // REMIND_3_DAYS / NONE
}
```

**Response**: `200 OK`,触发 Profile Updater

### POST /replay/:session_id/feedback

用户对老白的某条输出反馈。

**Request**:
```json
{
  "message_id": "msg_xxx",
  "feedback_type": "not_like_laoke",
  "feedback_note": "感觉太正经了"
}
```

**Response**: `200 OK`

---

## 5. 截图上传 Upload

### POST /uploads/screenshot

上传截图(返回 OSS URL,前端再用这个 URL 调 /replay/start)。

**Request**: `multipart/form-data`
- `file`: 图片文件 (jpg/png,最大 10MB)

**Response**:
```json
{
  "ok": true,
  "data": {
    "url": "https://oss.lianai.com/screenshots/xxx.jpg",
    "size": 1234567,
    "width": 750,
    "height": 1334
  }
}
```

或者使用 OSS 直传:

### GET /uploads/oss-token

获取 OSS 直传的临时凭证。

**Response**:
```json
{
  "ok": true,
  "data": {
    "access_key_id": "...",
    "access_key_secret": "...",
    "security_token": "...",
    "bucket": "lianai-screenshots",
    "region": "oss-cn-shanghai",
    "expires_at": "2026-05-03T11:00:00Z"
  }
}
```

---

## 6. 成长报告 Growth

### GET /growth/monthly/current

获取本月报告。

**Response**:
```json
{
  "ok": true,
  "data": {
    "id": "rep_xxx",
    "report_type": "MONTHLY",
    "period_start": "2026-04-01",
    "period_end": "2026-04-30",
    "total_sessions": 12,
    "total_relationships": 2,
    "content": {
      "things_laoke_saw": [
        "你越来越能识别自己的灾难化思维了",
        "在和小雨的对话里,你开始更直接地表达感受",
        "你三月那次冲动的情绪,已经被你自己稳住"
      ],
      "key_moments": [
        {
          "date": "2026-04-15",
          "description": "你第一次主动说出『我有点紧张』",
          "session_id": "sess_xxx"
        }
      ],
      "next_month_suggestion": "下个月,试试..."
    },
    "read_at": null
  }
}
```

### GET /growth/monthly/:year/:month

获取历史月报。

### POST /growth/monthly/:id/read

标记月报已读。

**Response**: `200 OK`

---

## 7. 付费 Payment

### GET /payment/plans

获取所有可购档位。

**Response**:
```json
{
  "ok": true,
  "data": {
    "plans": [
      {
        "id": "SINGLE",
        "name": "单次",
        "price": 6.6,
        "currency": "CNY",
        "description": "解锁本次复盘"
      },
      {
        "id": "MONTHLY",
        "name": "月付",
        "price": 39,
        "currency": "CNY",
        "description": "30 天无限次,推荐",
        "recommended": true
      },
      {
        "id": "YEARLY",
        "name": "年付",
        "price": 299,
        "currency": "CNY",
        "description": "365 天无限次,省 36%",
        "discount_percent": 36
      }
    ]
  }
}
```

### POST /payment/apple-iap/verify

验证苹果 IAP 收据(客户端付费成功后调用)。

**Request**:
```json
{
  "receipt": "base64_encoded_receipt_data",
  "transaction_id": "1000000xxxxxxx",
  "product_id": "com.lianai.monthly"
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "subscription": {
      "id": "sub_xxx",
      "plan": "MONTHLY",
      "status": "ACTIVE",
      "expires_at": "2026-06-03T10:00:00Z"
    }
  }
}
```

### POST /payment/wechat/prepay

创建微信支付预订单(Android)。

**Request**:
```json
{
  "plan": "MONTHLY"
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "prepay_id": "wx12345...",
    "nonce_str": "...",
    "timestamp": "...",
    "sign": "..."
  }
}
```

### POST /webhook/wechat-pay

微信支付回调(微信服务器调用)。

### POST /webhook/apple-iap

苹果 App Store Server-to-Server 通知。

### GET /payment/subscriptions

获取当前用户的所有订阅记录。

### POST /payment/refund

申请退款。

**Request**:
```json
{
  "subscription_id": "sub_xxx",
  "reason": "不太用得上"
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "refund_status": "PROCESSING",
    "refund_id": "refund_xxx"
  }
}
```

---

## 8. 数据控制权 Data Control

### GET /data/overview

我的数据概览。

**Response**:
```json
{
  "ok": true,
  "data": {
    "total_sessions": 23,
    "total_messages": 156,
    "total_observations": 47,
    "total_assertions": 12,
    "total_relationships": 3,
    "estimated_export_size_mb": 2.3
  }
}
```

### GET /data/sessions

我的所有会话(为了让用户看到自己的数据)。

**Query**: `relationship_id`, `page`, `page_size`

### GET /data/observations

我的所有 observations。

**Query**: `relationship_id`, `page`, `page_size`

### POST /data/export

请求导出全量数据。

**Request**:
```json
{
  "format": "JSON"  // "JSON" / "MARKDOWN"
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "export_id": "exp_xxx",
    "status": "PROCESSING"  // 异步任务
  }
}
```

完成后用户会收到 push 通知或邮件。

### GET /data/export/:id

下载导出文件。

**Response**: 文件流(.zip / .json / .md)

### DELETE /users/me

注销账号(进入 30 天反悔窗口)。

**Request**:
```json
{
  "confirm": "我确认要注销账号"
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "deletion_log_id": "del_xxx",
    "scheduled_execute_at": "2026-06-03T10:00:00Z",
    "can_cancel_until": "2026-06-03T10:00:00Z"
  }
}
```

### POST /users/me/cancel-deletion

撤销注销(在 30 天窗口内)。

**Response**: `200 OK`

---

## 9. 危机干预 Crisis

### POST /crisis/trigger

触发危机干预(由 AI 内部调用,记录用户状态)。

**Request**:
```json
{
  "session_id": "sess_xxx",
  "trigger_type": "self_harm" // self_harm / harm_to_other / minor_involved / non_consent
}
```

**Response**: `200 OK`

### POST /crisis/acknowledge

用户点击「我没事,只是聊聊」。

**Request**:
```json
{
  "session_id": "sess_xxx"
}
```

**Response**: `200 OK`(此 session 标记为不可继续到 DRAFTING)

---

## 10. 设置 Settings

### GET /settings

获取当前用户设置。

**Response**:
```json
{
  "ok": true,
  "data": {
    "usage_stage_override": null,  // null = 自动
    "theme": "auto",                // "auto" / "light" / "dark"
    "notifications_enabled": false,
    "language": "zh-CN"
  }
}
```

### PATCH /settings

更新设置。

---

## 错误码完整列表

| Code | HTTP Status | 含义 |
|------|------------|------|
| `AUTH_REQUIRED` | 401 | 未鉴权 |
| `TOKEN_EXPIRED` | 401 | Token 过期 |
| `INVALID_TOKEN` | 401 | Token 无效 |
| `WECHAT_AUTH_FAILED` | 400 | 微信授权失败 |
| `PERMISSION_DENIED` | 403 | 无权限 |
| `RESOURCE_NOT_FOUND` | 404 | 资源不存在 |
| `INVALID_PARAMS` | 400 | 参数错误 |
| `RATE_LIMITED` | 429 | 限流 |
| `OCR_FAILED` | 503 | 截图识别失败 |
| `AI_TIMEOUT` | 503 | AI 服务超时 |
| `AI_RED_LINE_TRIGGERED` | 451 | 触发红线 |
| `CROSS_RELATIONSHIP_LEAK` | 500 | 跨关系数据泄露(P0 内部) |
| `CRISIS_TRIGGERED` | 200 | 危机干预触发(非错误,提示) |
| `PAYMENT_FAILED` | 400 | 支付失败 |
| `PAYMENT_VERIFICATION_FAILED` | 400 | 支付验证失败 |
| `SUBSCRIPTION_REQUIRED` | 402 | 需要付费订阅 |
| `INTERNAL_ERROR` | 500 | 服务器错误 |

---

## 限流规则

| 端点 | 限制 |
|------|------|
| /auth/* | 10 次/分钟/IP |
| /replay/start | 10 次/小时/用户(免费用户 3 次/天) |
| /uploads/* | 30 次/小时/用户 |
| 其他 | 100 次/分钟/用户 |

超限返回 `429 Rate Limited`。
