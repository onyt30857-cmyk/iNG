# Design System - 设计系统

> 完整的 design tokens 和组件规范。
> 所有 UI 实施必须严格遵守此文档,**禁止 hardcode**。

---

## 1. 设计原则

| 原则 | 含义 |
|-----|------|
| 克制 | 不堆图标、不滥用渐变、留白比内容重要 |
| 有质感 | 圆角精准、阴影分明、字间距和行高让中文阅读舒适 |
| 不油腻 | 不用粉色 + 心形、不用花体字、不用闪光特效 |
| 像日记本 | 视觉接近 Things 3 / Linear / 苹果备忘录,而非 Lovekey/蜜小语 |
| 让用户慢下来 | 流式输出留呼吸节奏,关键决策前给停顿空间 |

---

## 2. 色彩系统

### 2.1 主色 - 深墨紫 (Ink Purple)

| Token | Hex | RGB | 用途 |
|-------|-----|-----|------|
| `--color-primary` | `#8B5CF6` | 139, 92, 246 | 主色,关键 CTA、老 K 角标 |
| `--color-primary-hover` | `#7C3AED` | 124, 58, 237 | Hover 态 |
| `--color-primary-deep` | `#6D28D9` | 109, 40, 217 | 强调元素 |
| `--color-primary-light` | `#DDD6FE` | 221, 214, 254 | 选中态背景 |
| `--color-primary-subtle` | `#F5F3FF` | 245, 243, 255 | 卡片背景 |

### 2.2 中性色 - 暖灰 (Warm Gray)

| Token | Hex | 用途 |
|-------|-----|------|
| `--color-text-primary` | `#0F172A` | 主要文字 |
| `--color-text-secondary` | `#334155` | 次要文字 |
| `--color-text-tertiary` | `#64748B` | 辅助、说明 |
| `--color-text-disabled` | `#94A3B8` | 禁用、占位 |
| `--color-border` | `#E2E8F0` | 分割线、边框 |
| `--color-surface-subtle` | `#F1F5F9` | 微弱背景 |
| `--color-background` | `#FAFAF9` | 主背景 |
| `--color-surface` | `#FFFFFF` | 卡片、对话气泡 |

### 2.3 语义色

| Token | Hex | 用途 |
|-------|-----|------|
| `--color-success` | `#059669` | 完成、积极 |
| `--color-warning` | `#D97706` | 提示、待办 |
| `--color-danger` | `#DC2626` | 红线、删除 |
| `--color-info` | `#0891B2` | 信息、链接 |

### 2.4 暗色模式

```scss
// 主背景层级
--color-background: #0F0F14;       // 主背景(不用纯黑,带紫黑感)
--color-surface: #1A1A24;          // 卡片底
--color-surface-elevated: #252533; // 浮起的卡片
--color-border: #2F2F40;           // 分割线、边框

// 文字
--color-text-primary: #F5F5F7;     // 主要文字(不用纯白)
--color-text-secondary: #CACAD0;
--color-text-tertiary: #8E8E99;
--color-text-disabled: #5C5C6B;

// 主色调整(暗背景下深紫看不清)
--color-primary: #A78BFA;          // 暗色下用更亮的紫
--color-primary-deep: #8B5CF6;
--color-primary-subtle: #4C1D95;   // 暗色卡片背景
```

### 2.5 色彩使用原则

1. **80% 中性色 + 15% 主色 + 5% 语义色**——比例不能反
2. 同一屏不超过 3 种主要色彩
3. 深紫只在「关键 CTA」「老 K 角标」「重要徽标」三处出现
4. **绝不用粉色**
5. **绝不用渐变填充大面积**

---

## 3. 字体系统

### 3.1 字体选择

```scss
$font-family-zh: -apple-system, BlinkMacSystemFont, 
                 "PingFang SC", "Microsoft YaHei", 
                 "HarmonyOS Sans SC", "Source Han Sans SC", 
                 sans-serif;

$font-family-en: -apple-system, BlinkMacSystemFont, 
                 "SF Pro Text", "Inter", 
                 system-ui, sans-serif;

// 等宽数字
$font-feature-tabular: "tnum" 1;
```

### 3.2 字号系统

以 iPhone 14 标准 16pt 为基准:

| Token | iPhone (pt) | Web (rem) | 行高 | 用途 |
|-------|-----------|-----------|------|------|
| `--font-display` | 32 | 2.0 | 1.3 | 欢迎页大标题、关键 hero |
| `--font-title-1` | 24 | 1.5 | 1.4 | 章节标题 |
| `--font-title-2` | 20 | 1.25 | 1.4 | 子标题、卡片标题 |
| `--font-title-3` | 18 | 1.125 | 1.5 | 小标题、表头 |
| `--font-body` | 16 | 1.0 | 1.6 | 正文、对话、按钮 |
| `--font-body-small` | 14 | 0.875 | 1.6 | 次要正文 |
| `--font-caption` | 13 | 0.8125 | 1.5 | 时间戳、辅助 |
| `--font-footnote` | 12 | 0.75 | 1.4 | 极小辅助、版本号 |

### 3.3 字重

| Token | 值 | 用途 |
|-------|-----|------|
| `--weight-regular` | 400 | 正文 |
| `--weight-medium` | 500 | 强调 |
| `--weight-semibold` | 600 | 标题 |
| `--weight-bold` | 700 | 大标题、Hero |

### 3.4 老 K 说话特殊规格

老 K 的话比正文大半号:

```scss
.laoke-message {
  font-size: 17pt; // 比 body (16pt) 大 1pt
  line-height: 1.6;
  color: var(--color-text-primary);
  font-weight: 400;
}
```

---

## 4. 间距系统(8px 基础栅格)

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-1` | 4px | 图标和文字间 |
| `--space-2` | 8px | 紧凑场景 |
| `--space-3` | 12px | 相关元素之间 |
| `--space-4` | 16px | 常规元素之间 |
| `--space-5` | 20px | 次要分组 |
| `--space-6` | 24px | 主要分组 |
| `--space-8` | 32px | 章节之间 |
| `--space-12` | 48px | 大块分隔 |
| `--space-16` | 64px | Hero 区域 |

### 4.1 安全边距

| 元素 | 值 |
|-----|-----|
| 屏幕左右内边距 | 16px (小屏) / 20px (标准) |
| 卡片内边距 | 16-20px |
| 列表项之间 | 12-16px |

---

## 5. 圆角系统

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | 4px | 小标签、徽章 |
| `--radius` | 8px | 常规按钮、输入框 |
| `--radius-md` | 12px | 卡片、对话气泡 |
| `--radius-lg` | 16px | 大卡片、Modal |
| `--radius-xl` | 24px | 页面级容器 |
| `--radius-full` | 9999px | 圆形头像、胶囊按钮 |

---

## 6. 阴影系统

```scss
--shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04);

--shadow: 0 1px 3px rgba(15, 23, 42, 0.06), 
          0 1px 2px rgba(15, 23, 42, 0.04);

--shadow-md: 0 4px 6px rgba(15, 23, 42, 0.05), 
             0 2px 4px rgba(15, 23, 42, 0.04);

--shadow-lg: 0 10px 15px rgba(15, 23, 42, 0.06), 
             0 4px 6px rgba(15, 23, 42, 0.04);

--shadow-xl: 0 20px 25px rgba(15, 23, 42, 0.08), 
             0 8px 10px rgba(15, 23, 42, 0.04);
```

| Token | 用途 |
|-------|------|
| `--shadow-sm` | 轻微浮起、按钮悬停 |
| `--shadow` | 卡片默认 |
| `--shadow-md` | 重要卡片、Modal 浅 |
| `--shadow-lg` | Modal、底部抽屉 |
| `--shadow-xl` | 悬浮元素 |

**原则**:不用纯黑色阴影,用稍带暖色的深色匹配整体调性。

暗色模式下:阴影减弱,几乎看不见,用边框区分层级。

---

## 7. 组件规范

### 7.1 按钮 Button

#### 类型

| 类型 | 背景 | 文字 | 用途 |
|-----|-----|-----|------|
| Primary | `--color-primary` | 白 | 关键 CTA(发送、确认、付费) |
| Secondary | 白 | `--color-primary` | 次要 CTA(取消、返回) |
| Tertiary | 透明 | `--color-text-secondary` | 普通操作 |
| Ghost | `--color-surface-subtle` | `--color-text-secondary` | 辅助操作 |
| Danger | `--color-danger` | 白 | 删除、注销 |

#### 尺寸

| 尺寸 | 高度 | 字号 | padding | 用途 |
|-----|-----|------|---------|------|
| Large | 48px | 16pt | 16px 24px | 关键 CTA(主页面唯一一个) |
| Medium | 40px | 15pt | 12px 20px | 标准按钮 |
| Small | 32px | 14pt | 8px 16px | 卡片内按钮 |

#### 状态

- Default
- Hover (Web): 颜色加深 5%
- Active/Pressed: 颜色加深 10% + 轻微缩放 0.98
- Disabled: opacity 0.4
- Loading: 替换为旋转图标 + 文字

#### 圆角

- 标准: `--radius` (8px)
- 胶囊型: `--radius-full`

### 7.2 输入框 Input

```scss
.input {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 12px 16px;
  font-size: 16px; // ★ 必须 16px,防 iOS 自动放大
  
  &:focus {
    border: 2px solid var(--color-primary);
    box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.1);
    outline: none;
  }
  
  &.error {
    border-color: var(--color-danger);
  }
  
  &::placeholder {
    color: var(--color-text-disabled);
  }
}

.input-error-message {
  color: var(--color-danger);
  font-size: 12pt;
  margin-top: 4px;
}
```

### 7.3 对话气泡 MessageBubble

#### 老 K 气泡

```scss
.message-laoke {
  background: var(--color-surface);
  color: var(--color-text-primary);
  padding: 14px 16px;
  border-radius: 12px;
  border-bottom-left-radius: 4px; // 左下角小圆角,表示来源
  box-shadow: var(--shadow-sm);
  border-left: 1px solid var(--color-primary); // 紫色细线
  font-size: 17pt; // 比 body 大半号
  line-height: 1.6;
  max-width: 85%;
}
```

#### 用户气泡

```scss
.message-user {
  background: var(--color-surface-subtle);
  color: var(--color-text-primary);
  padding: 14px 16px;
  border-radius: 12px;
  border-bottom-right-radius: 4px;
  // 无阴影
  font-size: 16pt;
  max-width: 85%;
  align-self: flex-end;
}
```

#### 截图气泡

```scss
.message-screenshot {
  border-radius: 8px;
  max-width: 240px;
  cursor: pointer;
  
  // 暗色模式下加边框
  @media (prefers-color-scheme: dark) {
    border: 1px solid var(--color-border);
  }
}
```

### 7.4 卡片 Card

#### 基础卡片

```scss
.card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow);
  padding: 16px 20px;
  // 不用边框,用阴影做层次
}
```

#### 话术卡片(核心组件)

话术卡片是产品最重要的组件之一。结构:

```
┌──────────────────────────────────┐
│ [direction_label]            [⋯] │
│                                  │
│ [reply_text 主体内容]            │
│                                  │
│ [what_it_does] · [good_for] · [trade_off] │
└──────────────────────────────────┘
```

```scss
.reply-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow);
  padding: 18px;
  margin-bottom: 12px;
  
  &:active {
    transform: scale(1.02);
    box-shadow: var(--shadow-md);
  }
  
  .direction-label {
    font-size: 14pt;
    font-weight: 600;
    color: var(--color-primary);
    margin-bottom: 8px;
  }
  
  .menu-button {
    position: absolute;
    top: 18px;
    right: 18px;
  }
  
  .reply-text {
    font-size: 16pt;
    color: var(--color-text-primary);
    line-height: 1.6;
    margin-bottom: 16px;
  }
  
  .meta-row {
    display: flex;
    gap: 12px;
    
    .meta-item {
      font-size: 13pt;
      color: var(--color-text-tertiary);
      
      .label {
        font-weight: 500;
        margin-right: 4px;
      }
    }
  }
}
```

### 7.5 Modal 和底部抽屉

#### Modal(居中)

```scss
.modal-overlay {
  background: rgba(15, 23, 42, 0.5);
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  width: calc(100% - 48px);
  max-width: 400px;
  padding: 24px;
}
```

#### 底部抽屉 BottomSheet

```scss
.bottom-sheet {
  background: var(--color-surface);
  border-top-left-radius: var(--radius-xl);
  border-top-right-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  padding: 24px 20px;
  max-height: 80vh;
  
  // 顶部 handle
  &::before {
    content: '';
    display: block;
    width: 36px;
    height: 4px;
    background: var(--color-border);
    border-radius: 2px;
    margin: 0 auto 16px;
  }
}
```

### 7.6 列表项 ListItem

```scss
.list-item {
  display: flex;
  align-items: center;
  padding: 16px;
  height: 64px; // 带头像 / 48px 无头像
  
  &:active {
    background: var(--color-surface-subtle);
  }
  
  .avatar {
    width: 40px;
    height: 40px;
    margin-right: 12px;
  }
  
  .content {
    flex: 1;
    
    .title {
      font-size: 16pt;
      color: var(--color-text-primary);
    }
    
    .subtitle {
      font-size: 13pt;
      color: var(--color-text-tertiary);
      margin-top: 2px;
    }
  }
  
  .right-action {
    color: var(--color-text-tertiary);
  }
}

.list-divider {
  height: 1px;
  background: var(--color-border);
  margin-left: 16px;
}
```

### 7.7 标签 Tag/Chip

```scss
.tag {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: var(--radius-full);
  font-size: 13pt;
  
  &.default {
    background: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  
  &.selected {
    background: var(--color-primary-light);
    color: var(--color-primary-deep);
  }
}
```

### 7.8 头像

```scss
.relationship-avatar {
  border-radius: var(--radius-full);
  
  // 默认:渐变 + 首字母
  &.default {
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 500;
    
    // 8 种莫兰迪渐变(根据关系名 hash 选)
    &.gradient-1 { background: linear-gradient(135deg, #C7B299 0%, #A8967D 100%); }
    &.gradient-2 { background: linear-gradient(135deg, #B8C5C9 0%, #8FA5AB 100%); }
    &.gradient-3 { background: linear-gradient(135deg, #D4A5A5 0%, #B68585 100%); }
    &.gradient-4 { background: linear-gradient(135deg, #A8B5C4 0%, #7B8B9E 100%); }
    &.gradient-5 { background: linear-gradient(135deg, #B8A89B 0%, #968675 100%); }
    &.gradient-6 { background: linear-gradient(135deg, #9BAEC2 0%, #7B92A8 100%); }
    &.gradient-7 { background: linear-gradient(135deg, #C9B8B0 0%, #A89890 100%); }
    &.gradient-8 { background: linear-gradient(135deg, #B5A89B 0%, #8E8074 100%); }
  }
}

.laoke-avatar {
  width: 24px;
  height: 24px;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  color: white;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &::before {
    content: 'K';
  }
}
```

---

## 8. 动效规范

### 8.1 时长

| 场景 | 时长 | 缓动 |
|-----|------|------|
| 按钮点击 | 100ms | ease-out |
| Tab 切换 | 200ms | ease-in-out |
| Push 进入新页面 | 300ms | ease-in-out |
| Pop 返回 | 250ms | ease-in-out |
| Modal 弹出 | 350ms | ease-out |
| 底部抽屉 | 400ms | ease-out |
| 复盘状态切换 | 400ms | ease-in-out (有仪式感) |

**原则**:不追求快,追求"自然"。

### 8.2 流式输出

```typescript
// 字符出现速度: 25-35 字/秒
const TYPING_SPEED_MS = 30; // 每个字符 30ms

// 段落之间停顿
const PARAGRAPH_PAUSE_MS = 400;

// 关键句子前停顿(让用户感受老 K 在斟酌)
const KEY_SENTENCE_PAUSE_MS = 600;

// 光标
.streaming-cursor {
  animation: blink 1s infinite;
  color: var(--color-primary);
  opacity: 0.6;
}

@keyframes blink {
  0%, 50% { opacity: 0.6; }
  51%, 100% { opacity: 0; }
}
```

### 8.3 触感反馈

| 操作 | iOS Haptic | 安卓振动 |
|-----|----------|---------|
| 按钮点击 | Light | 25ms |
| 成功完成 | Success | 双击 50ms |
| 错误提示 | Error | 长 100ms |
| 话术卡片选中 | Medium | 50ms |
| 长按操作 | Heavy | 75ms |

工具函数:

```typescript
// utils/haptic.ts
export const haptic = {
  light: () => uni.vibrateShort?.({ type: 'light' }),
  medium: () => uni.vibrateShort?.({ type: 'medium' }),
  heavy: () => uni.vibrateShort?.({ type: 'heavy' }),
  success: () => uni.vibrateLong?.(),
  error: () => uni.vibrateLong?.(),
};
```

---

## 9. 暗色模式

### 9.1 切换逻辑

```typescript
// stores/settings.ts
type ThemeMode = 'auto' | 'light' | 'dark';

const themeMode = ref<ThemeMode>('auto');
const systemTheme = ref<'light' | 'dark'>('light');

const effectiveTheme = computed(() => {
  if (themeMode.value === 'auto') return systemTheme.value;
  return themeMode.value;
});

// uni-app 监听系统主题
uni.onThemeChange(({ theme }) => {
  systemTheme.value = theme;
});
```

### 9.2 切换动效

300ms 淡入淡出。

### 9.3 暗色特殊处理

- 阴影减弱,用边框区分层级
- 图片和缩略图加 1px 边框
- 截图气泡用稍亮一点的灰底,不用白底

---

## 10. 文件组织

```
apps/mobile/design/
├── tokens.scss          // 所有 design tokens (CSS 变量)
├── light.scss           // 亮色主题变量
├── dark.scss            // 暗色主题变量
├── reset.scss           // 重置样式
├── typography.scss      // 字体相关
├── animation.scss       // 通用动效
└── mixins.scss          // SCSS mixins
```

入口:`design/index.scss`,在 `App.vue` 引入。

---

## 11. 验收清单

每个组件/页面提交前自查:

- [ ] 没有 hardcode 颜色(全部 var(--xxx))
- [ ] 没有 hardcode 字号(全部 var(--font-xxx))
- [ ] 没有 hardcode 间距(全部 var(--space-x))
- [ ] 没有 hardcode 圆角(全部 var(--radius-xxx))
- [ ] 实现了所有状态(Default/Hover/Active/Disabled/Loading/Empty/Error)
- [ ] 实现了暗色模式
- [ ] 主操作有 haptic 反馈
- [ ] 真机测试过(iPhone + 安卓中端机)
