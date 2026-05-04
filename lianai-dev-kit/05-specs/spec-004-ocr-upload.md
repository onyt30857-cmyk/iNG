# spec-004: 截图上传 + OCR

> 创建日期: 2026-05
> 对应:Week 4
> 依赖:spec-001(脚手架)、spec-002(微信登录)、spec-003(关系档案)

## 1. 这是什么

实现复盘流程的入口环节:用户从相册选择 1-5 张聊天截图上传,后端调 Gemini 2.5 Flash 提取对话内容,转成结构化 JSON。

这是复盘场景的**第一步**,直接决定后续 AI 复盘的质量上限。

## 2. 为什么做

- 截图上传 → OCR 是用户进入复盘的唯一入口(M1 不做手动输入)
- OCR 准确率决定 PARSING、REFLECTING、DIAGNOSING 的输入质量
- 着力点 #7(截图深度理解)的 M1 基础版

## 3. 详细需求

### 3.1 必须实现的功能

#### 截图上传
用户在复盘入口(底部抽屉)操作:
- 点击 "+" 选择截图
- 调系统相册(uni-app 的 `uni.chooseImage`)
- 最多 5 张,单张最大 10MB
- 用户可调整顺序(按时间从早到晚)
- 用户可删除已选择的图

#### 上传到阿里云 OSS
- 客户端先压缩(质量 85%,长边 < 2000px)
- 上传到 OSS,bucket: `lianai-screenshots`
- 路径:`screenshots/{userId}/{relationshipId}/{sessionId}/{timestamp}-{n}.jpg`
- 服务端拿到 OSS URL 后存入 `messages.screenshot_urls` 字段

#### OCR(Gemini 2.5 Flash)
后端调 Gemini 2.5 Flash 提取对话:
- 输入:N 张截图的 OSS URL
- 输出:结构化 JSON,见下方 schema

#### 结构化输出 schema
```json
{
  "events": [
    {
      "speaker": "user" | "other",  // 截图中的左侧/右侧或头像识别
      "text": "原文",
      "timestamp": "2026-05-15T20:30:00+08:00" | null,  // 截图中显示的时间
      "type": "text" | "image" | "voice" | "sticker" | "system_notice",
      "raw_position": { "screenshot_index": 0, "y_offset": 120 }
    }
  ],
  "metadata": {
    "platform": "wechat" | "qq" | "xiaohongshu" | "unknown",
    "duration": "约 2 小时" | null,
    "user_message_count": 5,
    "other_message_count": 3,
    "last_message_speaker": "user" | "other",
    "last_message_time_ago": "2 小时前" | null
  },
  "warnings": [
    "第 3 张截图模糊,可能漏了 1-2 条消息"
  ]
}
```

#### 流式反馈
- 上传过程显示进度
- OCR 中显示"老 K 在看你的截图..."(2-5 秒)
- 完成后进入 PARSING 状态

### 3.2 必须不实现的事

- ❌ 不做"自动识别对方头像并猜测身份"
- ❌ 不主动从截图中提取个人隐私信息(电话、地址、银行卡号)
- ❌ 不做截图的二次存档展示(隐私考虑)
- ❌ 不做长期保留(30 天后真删原图,只留 OCR 结构化文本)

### 3.3 边界情况

| 场景 | 处理 |
|------|------|
| 用户上传非聊天截图(风景、表情包) | Gemini 返回空 events,前端提示"我没看到对话,你重新选一下?" |
| 截图被裁剪不完整 | warnings 标注,继续处理 |
| 截图模糊/水印干扰 | warnings 标注,继续处理 |
| Gemini API 超时(>30秒) | 自动降级到 PaddleOCR(M1 阶段先用 Gemini,失败抛错给用户) |
| 用户上传英文/混合语言截图 | M1 仅支持中文,英文截图 warnings 提示 |
| 上传中网络断开 | 标记 session 为 ERROR,7 天内可恢复继续 |

## 4. 输入输出

### 4.1 数据库变更
完整 schema 见 `02-architecture/database-schema.prisma`。本 spec 涉及:
- `sessions` 表:新建 session 时 `state = 'ENTRY'`
- `messages` 表:OCR 完成后批量插入 `events`

### 4.2 API 接口

```
POST   /api/v1/sessions                       创建 session(用户开始上传前)
POST   /api/v1/sessions/:id/upload-tokens     获取 OSS 直传凭证(签名)
POST   /api/v1/sessions/:id/screenshots       提交所有截图 URL,触发 OCR
GET    /api/v1/sessions/:id                   查询 session 状态(轮询用,但优先用 SSE)
GET    /api/v1/sessions/:id/stream            SSE 流式接收 OCR 进展和后续 PARSING
```

详细见 `02-architecture/api-design.md` 第 6 节。

### 4.3 UI 变更

- `apps/mobile/pages/replay/entry.vue` - 复盘入口(底部抽屉)
- `apps/mobile/components/ScreenshotPicker.vue` - 截图选择器组件
- `apps/mobile/components/ScreenshotThumbnail.vue` - 缩略图

## 5. 关联文件

### 后端新建
```
apps/api/src/
├── services/
│   ├── session-service.ts       # session CRUD
│   ├── upload-service.ts        # OSS 直传凭证生成
│   └── ocr-service.ts           # Gemini OCR 封装
├── routes/
│   ├── session.ts
│   └── upload.ts
├── ai/
│   └── gemini-client.ts         # Gemini 调用封装
└── workers/
    └── ocr.worker.ts            # OCR 异步队列(BullMQ)
```

### 前端新建
```
apps/mobile/
├── pages/replay/
│   └── entry.vue
├── components/
│   ├── ScreenshotPicker.vue
│   └── ScreenshotThumbnail.vue
├── api/
│   └── upload.ts
└── utils/
    ├── compress-image.ts        # 图片压缩
    └── oss-uploader.ts          # OSS 客户端直传
```

## 6. 测试用例

### 6.1 OCR 准确率测试集
准备 30 张真实聊天截图(微信为主),分类:
- 标准截图(20 张):清晰、双方对话明显、有时间戳
- 边缘截图(7 张):模糊、被裁剪、有水印、混排表情
- 异常截图(3 张):非聊天截图、纯文字、风景

期望:
- 标准截图准确率 ≥ 95%
- 边缘截图准确率 ≥ 80%
- 异常截图正确返回空 events 或 warning

### 6.2 后端单测
```typescript
describe('ocr-service', () => {
  it('完整截图 - 提取 events', async () => {});
  it('Gemini API 故障 - 抛 OCR_FAILED 错误', async () => {});
  it('非聊天截图 - 返回空 events + warning', async () => {});
  it('OCR 结果校验 - 不符合 schema 时报错', async () => {});
});

describe('upload-service', () => {
  it('生成 OSS 直传凭证 - 路径含 userId', async () => {});
  it('凭证有效期 5 分钟', async () => {});
  it('用户 A 不能用用户 B 的凭证', async () => {});
});
```

### 6.3 手工测试
- [ ] 真机选 5 张截图,顺序调整后上传
- [ ] OCR 完成后 events 数量符合预期
- [ ] 模糊截图能正确触发 warning
- [ ] 上传中网络断开,session 标记 ERROR,可恢复
- [ ] 暗色模式截图选择器样式正常

## 7. 验收标准

### 功能层面
- 5 个 API 接口实现且单测通过
- 30 张测试集准确率达标(标准 95%、边缘 80%)
- OCR 在 95% 的请求下 < 8 秒返回
- 错误场景全部有友好兜底

### 性能层面
- 客户端压缩后单图 < 500KB
- 上传 5 张截图(总 < 2.5MB) < 10 秒
- OCR 平均响应 < 5 秒

### 安全
- OSS 直传凭证含路径限制(只能上传到该用户该 session 的目录)
- 凭证 5 分钟过期
- 上传后服务端校验文件类型和大小
- OCR 文本结果不包含识别到的电话号码、银行卡号(简单正则过滤)

### Claude 自检
- [ ] 已读 CLAUDE.md
- [ ] 已读 spec-004
- [ ] 已读 02-architecture/api-design.md 第 6 节
- [ ] OCR 调用经过 ai/client.ts 统一封装
- [ ] 上传路径包含 relationshipId(便于后续隔离)
- [ ] 实现了 30 天截图自动删除的 worker(可放 M1 后期,先注释掉占位)
- [ ] 隐私正则过滤已实现
- [ ] 测试集 30 张已跑过且达标
