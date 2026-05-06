# Supabase Storage 接入指南

> 目标:把头像 / 截图从 base64 data URL(进 db)切换到 Supabase Storage(返 https URL)
> 状态:代码已就位,等 Sam 在 Supabase 创建 project + bucket + 拿 keys
> Graceful degrade:无 keys 自动 fallback,dev 阶段不影响

## 1. 在 Supabase 上创建 project

1. 注册 [supabase.com](https://supabase.com)
2. 点 **New Project**
3. 选最近 region(国内推荐 Tokyo / Singapore)
4. project 创建后等 2 分钟初始化

## 2. 创建头像 bucket

1. 左侧菜单 → **Storage** → **New bucket**
2. Name: `lianai-avatars`(必须跟 `.env` 里 `SUPABASE_AVATAR_BUCKET` 一致)
3. **Public bucket**:勾上(头像本来就要公开访问)
4. File size limit:1 MB(已经在后端校验)
5. Allowed MIME types:`image/jpeg, image/png, image/webp`

## 3. 拿 keys

1. 左侧菜单 → **Settings** → **API**
2. 复制:
   - **Project URL** (`https://xxx.supabase.co`)
   - **service_role key**(标着 **secret**,不要泄漏 — 它能 bypass 所有 RLS)
3. **不要**用 `anon key`(只有读权限,后端写需要 service_role)

## 4. 写 .env

打开 `apps/api/.env`,加 3 行:

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx...
SUPABASE_AVATAR_BUCKET=lianai-avatars
```

## 5. 重启 API server

```bash
pnpm --filter @lianai/api dev
```

启动时 storage.service.ts 会自动检测 keys 是否在,在就启用 Supabase 模式。

## 6. 验证

```bash
# 拿一个测试用户 token(seed-dev 输出的)
TOKEN="..."

# 上传一个最小测试图(1x1 jpeg)
curl -X POST http://localhost:3000/v1/storage/avatar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"data_url":"data:image/jpeg;base64,/9j/4AAQSkZJ..."}'
```

返回:
- `driver: "supabase"`(配置成功)
- `url: "https://xxx.supabase.co/storage/v1/object/public/lianai-avatars/<user_id>/avatar-<timestamp>.jpg"`

把 url 粘到浏览器能直接看到图就说明 Public bucket 配置对了。

## 7. 前端无需任何改动

`detail.vue pickAvatar` 已经调 `uploadAvatarApi`,后端 storage.service.ts
graceful degrade:
- 有 keys → 真上传 Supabase,返 https URL
- 无 keys → fallback 返 base64 dataUrl(M1 dev 行为)

切换零成本,不需要改代码、不需要前端发版。

## 8. 故障排查

### 上传报错 "row-level security policy"

Supabase 默认开 RLS。要么:
- A. service_role key 默认 bypass RLS(应该自动 work)
- B. 在 Storage > Policies 给 `lianai-avatars` bucket 加 policy:`for INSERT to service_role using (true)`

### Public URL 访问 403

Bucket 没设 Public。在 Storage > 选中 bucket > Settings > Public bucket 勾上。

### 国内访问慢

Supabase 国内访问可能不稳。M2 真上线前评估:
- 选最近 region(Tokyo / Singapore)
- 加 CDN 前置(Cloudflare 国内有节点)
- 或换回阿里云 OSS(代码层 storage abstraction 已抽象,改 driver 即可)

## 9. 截图存储(spec-004 OCR)— 后续

当前 OCR 直接把截图 base64 传 Claude Vision,不存。
M2 如果要保留截图原文(用户回看 / 法务取证),用同样的 storage abstraction
加 `putScreenshot()` 即可,bucket 用 `lianai-screenshots`(默认非 public,签 URL 访问)。

## 10. 成本估算

Supabase 免费层:
- 1GB 存储
- 2GB 出口流量 / 月
- 50K 文件操作 / 月

足够 dev + 早期 50-100 真用户。超了升级 Pro($25/月)1000 用户。
