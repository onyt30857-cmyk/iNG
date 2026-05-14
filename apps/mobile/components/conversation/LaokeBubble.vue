<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { FeedbackType } from '../../api/feedback.api'
import { formatBubbleTime } from '../../utils/format-time'
import LaokeAvatar from '../LaokeAvatar.vue'

const props = defineProps<{
  text: string
  isThinking?: boolean
  isStreaming?: boolean
  /** spec-009 反馈通道:消息 id + 关系 id 用于提交反馈,不传则不显示反馈区 */
  messageId?: string
  relationshipId?: string
  /** 消息生成时间(ISO),气泡下显示时间小字让用户区分上次/这次 */
  createdAt?: string
}>()

// === v4 (2026-05-11) "老白深思" 等待 UI ===
// 不让用户干等,模拟真人思考节奏:进入 thinking 后,文字按时长分阶段切换,
// 用户感受到"老白在认真考虑",越复杂的问题等越久,越觉得他在用心
const THINKING_PHASES = [
  { at: 0, text: '老白想想' },          // 刚开始,默认状态
  { at: 2500, text: '他看了下你的话' }, // 2.5s 后,确认收到 + 在读
  { at: 5500, text: '他在斟酌' },       // 5.5s 后,深思中
  { at: 9000, text: '他要慢慢说' },     // 9s+,复杂问题给用户耐心
] as const

const thinkingPhraseIndex = ref(0)
const thinkingPhrase = computed(() => THINKING_PHASES[thinkingPhraseIndex.value]?.text ?? '老白想想')
let phaseTimers: Array<ReturnType<typeof setTimeout>> = []

function startThinkingPhases() {
  clearThinkingPhases()
  thinkingPhraseIndex.value = 0
  // 跳过 index 0(那是初始状态),从 index 1 开始定时切
  for (let i = 1; i < THINKING_PHASES.length; i++) {
    const phase = THINKING_PHASES[i]!
    phaseTimers.push(
      setTimeout(() => {
        thinkingPhraseIndex.value = i
      }, phase.at),
    )
  }
}
function clearThinkingPhases() {
  phaseTimers.forEach((t) => clearTimeout(t))
  phaseTimers = []
}

watch(
  () => props.isThinking,
  (now) => {
    if (now) startThinkingPhases()
    else clearThinkingPhases()
  },
  { immediate: true },
)
onUnmounted(clearThinkingPhases)

const formattedTime = computed(() => formatBubbleTime(props.createdAt))

// === 话术 chip 解析(spec-009)===
// 只把"独占一行的引号片段"识别成可复制话术 chip(那是老白真给的话术),
// 解释段里 inline quote 对方原话(如"她那句'有啥好事'")保持原文渲染。
// 这样避免 false positive 把解释里的引用错做成 chip。
interface Segment {
  type: 'quote' | 'plain'
  text: string
}
// 整行只有引号片段(允许两端空白)
const FULL_QUOTE_LINE = /^[\s]*["""「『]([^"""「」『』\n]{2,200})["""」』][\s]*$/

// 2026-05-14:Sam 反馈老白回复出现 ** 字符(LLM 残留 markdown)。
// 显示前 strip:**bold** / __bold__ / *italic* / _italic_ 全去掉,只剩内容文字。
function stripMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*([^*\n]+?)\*/g, '$1')
    .replace(/(^|[^_\w])_([^_\n]+?)_(?=[^_\w]|$)/g, '$1$2')
}

const segments = computed<Segment[]>(() => {
  const t = stripMd(props.text || '')
  if (!t) return []
  const out: Segment[] = []
  const lines = t.split('\n')
  let plainBuf: string[] = []

  function flushPlain() {
    if (plainBuf.length === 0) return
    const txt = plainBuf.join('\n').replace(/^\n+|\n+$/g, '')
    if (txt) out.push({ type: 'plain', text: txt })
    plainBuf = []
  }

  for (const line of lines) {
    const fullMatch = line.match(FULL_QUOTE_LINE)
    if (fullMatch) {
      flushPlain()
      out.push({ type: 'quote', text: fullMatch[1]! })
    } else {
      plainBuf.push(line)
    }
  }
  flushPlain()

  return out.length > 0 ? out : [{ type: 'plain', text: t }]
})

function copyQuote(text: string) {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '已复制,直接粘到聊天框就行', icon: 'none', duration: 1600 }),
    fail: () => uni.showToast({ title: '复制失败', icon: 'none' }),
  })
}

// === spec-009 反馈状态 ===
// 2026-05-14 Nikita audit:删收藏功能(AI 对话天然不需要),原 isSaved / toggleSave 已移除
// useConversationStore 保留 saveQuote 接口标 @deprecated,数据不丢,M4 物理删
const submittingFeedback = ref(false)
const feedbackGiven = ref<FeedbackType | null>(null)
const commentModalOpen = ref(false)
const commentText = ref('')

const showFeedback = computed(() =>
  !!props.messageId &&
  !!props.relationshipId &&
  !props.isThinking &&
  !props.isStreaming &&
  !!props.text,
)

type DislikeReason = 'oily' | 'off_persona' | 'off_topic' | 'repeated'

// Nikita audit(2026-05-14):dislike 拆 chip / comment 改"我会怎么回"
// like 仍互斥(用户点了就不点 dislike),但 like + comment 可同时
const dislikeChipsOpen = ref(false)

interface SubmitExtras {
  comment?: string
  dislikeReason?: DislikeReason
  correctedText?: string
}

async function submit(type: FeedbackType, extras: SubmitExtras = {}) {
  if (!props.messageId || !props.relationshipId) return
  if (submittingFeedback.value) return
  submittingFeedback.value = true
  try {
    const { submitFeedbackApi } = await import('../../api/feedback.api')
    const res = await submitFeedbackApi({
      relationship_id: props.relationshipId,
      message_id: props.messageId,
      bubble_text: props.text,
      feedback_type: type,
      comment: extras.comment ?? null,
      dislike_reason: extras.dislikeReason ?? null,
      corrected_text: extras.correctedText ?? null,
    })
    if (res.ok) {
      feedbackGiven.value = type
    } else {
      console.warn('[feedback] submit failed:', res.error.message)
    }
  } catch (e) {
    console.warn('[feedback] submit threw:', e)
  } finally {
    submittingFeedback.value = false
  }
}

function onLike() {
  if (feedbackGiven.value === 'like') return
  void submit('like')
}

// Nikita #1:点"不行" → 弹 chip 选具体原因(4 选 1),不再直接 dislike
function onDislike() {
  if (feedbackGiven.value === 'dislike') return
  dislikeChipsOpen.value = true
}
async function pickDislikeReason(reason: DislikeReason) {
  dislikeChipsOpen.value = false
  await submit('dislike', { dislikeReason: reason })
  uni.showToast({ title: '记下了', icon: 'none', duration: 1200 })
}
function closeDislikeChips() {
  dislikeChipsOpen.value = false
}

const DISLIKE_REASON_LABEL: Record<DislikeReason, string> = {
  oily: '油了',
  off_persona: '不像老白',
  off_topic: '没答到点',
  repeated: '重复了',
}

function onCommentTap() {
  commentText.value = ''
  commentModalOpen.value = true
}

function closeCommentModal() {
  commentModalOpen.value = false
}

// Nikita #2:"我教你怎么说" — 把用户写的当 corrected_text(黄金训练数据)
async function confirmComment() {
  const c = commentText.value.trim()
  if (!c) {
    closeCommentModal()
    return
  }
  await submit('comment', { correctedText: c })
  closeCommentModal()
}

// 长按菜单(2026-05-14 Nikita audit:删收藏功能)— 复制全文 / 不喜欢(快捷反馈)
// 原因:AI 对话天然不需要"收藏单条",历史本身就是档案
async function onLongPress() {
  if (props.isThinking || props.isStreaming) return
  const res = await uni.showActionSheet({
    itemList: ['复制', '不喜欢这条'],
    itemColor: '#1F2433',
  })
  if (res.tapIndex === 0) {
    uni.setClipboardData({ data: stripMd(props.text), showToast: false })
    uni.showToast({ title: '已复制', icon: 'none', duration: 1200 })
  } else if (res.tapIndex === 1) {
    if (feedbackGiven.value !== 'dislike') {
      // 长按 → 弹 chip,跟反馈区"不行"一致
      dislikeChipsOpen.value = true
    }
  }
}
</script>

<template>
  <view class="row">
    <view class="avatar-wrap" :class="{ 'avatar-pulse': isThinking || isStreaming }">
      <LaokeAvatar :size="64" />
    </view>

    <view class="bubble-wrap">
      <view
        class="bubble"
        :class="{ thinking: isThinking, streaming: isStreaming }"
        @longpress="onLongPress"
      >
        <!-- 思考中 — v4 (2026-05-11) "老白深思" UI:
             柔粉 dots + 文字按时长分阶段切换(0/2.5/5.5/9s)
             模拟真人思考节奏 — 越久 = 越在深思,用户感觉"被认真对待" -->
        <view v-if="isThinking" class="thinking-wrap">
          <view class="thinking-dots">
            <view class="dot"></view>
            <view class="dot"></view>
            <view class="dot"></view>
          </view>
          <text class="thinking-label" :key="thinkingPhrase">{{ thinkingPhrase }}</text>
        </view>
        <template v-else>
          <view class="text-segments">
            <template v-for="(seg, i) in segments" :key="i">
              <view
                v-if="seg.type === 'quote'"
                class="quote-chip"
                @tap="copyQuote(seg.text)"
              >
                <text class="quote-chip-text">{{ seg.text }}</text>
                <view class="quote-chip-action">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8" />
                    <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.8" />
                  </svg>
                  <text class="quote-chip-action-text">复制</text>
                </view>
              </view>
              <text v-else class="text">{{ seg.text }}</text>
            </template>
            <text v-if="isStreaming" class="caret">│</text>
          </view>
        </template>
      </view>

      <!-- 反馈区(2026-05-14 Nikita audit:有用 + 不对劲 chip + 我教你怎么说)-->
      <view v-if="showFeedback" class="feedback-row">
        <text
          :class="['fb-link', feedbackGiven === 'like' && 'fb-link-like']"
          @tap="onLike"
        >有用</text>
        <text class="fb-sep">·</text>
        <text
          :class="['fb-link', feedbackGiven === 'dislike' && 'fb-link-dislike']"
          @tap="onDislike"
        >不对劲</text>
        <text class="fb-sep">·</text>
        <text
          :class="['fb-link', feedbackGiven === 'comment' && 'fb-link-comment']"
          @tap="onCommentTap"
        >我教你怎么说</text>
      </view>

      <!-- Nikita #1:不对劲 → 弹 chip 选具体原因(结构化数据进 dislike_reason)-->
      <view v-if="dislikeChipsOpen" class="dislike-chips-wrap">
        <text class="dislike-chips-title">哪不对劲?</text>
        <view class="dislike-chips-row">
          <view
            v-for="r in (['oily', 'off_persona', 'off_topic', 'repeated'] as DislikeReason[])"
            :key="r"
            class="dislike-chip"
            @tap="pickDislikeReason(r)"
          >
            <text class="dislike-chip-text">{{ DISLIKE_REASON_LABEL[r] }}</text>
          </view>
          <view class="dislike-chip dislike-chip-skip" @tap="closeDislikeChips">
            <text class="dislike-chip-text">不说了</text>
          </view>
        </view>
      </view>

      <!-- 时间小字(气泡左下,思考态/流式态不显示避免抖动)-->
      <text
        v-if="formattedTime && !isThinking && !isStreaming"
        class="bubble-time"
      >{{ formattedTime }}</text>
    </view>
  </view>

  <!-- 评论 modal -->
  <view v-if="commentModalOpen" class="cm-overlay" @tap="closeCommentModal">
    <view class="cm-scrim"></view>
    <view class="cm-card" @tap.stop>
      <view class="cm-handle"></view>
      <text class="cm-title">换你,会怎么回?</text>
      <text class="cm-sub">写一句你觉得对的,老白学着,下次往这调</text>
      <textarea
        v-model="commentText"
        class="cm-input"
        placeholder="比如:今天累了吧,早点睡"
        maxlength="500"
        :focus="commentModalOpen"
      />
      <view class="cm-actions">
        <view class="cm-cancel" @tap="closeCommentModal">
          <text class="cm-cancel-text">取消</text>
        </view>
        <view class="cm-submit" @tap="confirmComment">
          <text class="cm-submit-text">提交</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  margin-bottom: 24rpx;
  max-width: 88%;
  animation: fadeIn 0.4s ease both;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: translateY(0); }
}

.avatar-wrap {
  flex-shrink: 0;
  margin-right: 16rpx;
  margin-top: 8rpx;
  position: relative;
}
.avatar-pulse::before {
  content: '';
  position: absolute;
  inset: -6rpx;
  border-radius: 50%;
  background-color: $color-laoke;
  opacity: 0.25;
  animation: avatar-halo 1.6s ease-in-out infinite;
  z-index: -1;
}
@keyframes avatar-halo {
  0%, 100% { transform: scale(0.92); opacity: 0; }
  50% { transform: scale(1.18); opacity: 0.35; }
}

.bubble-wrap {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.bubble {
  background-color: $color-surface;
  // 微信温和圆角:从 28rpx 收紧到 16rpx(微信式)
  border-radius: 16rpx 16rpx 16rpx 4rpx;
  // 老白标识:左 2rpx 紫色边条(从 $color-primary 改 $color-laoke,跟头像呼应)
  border-left: 2rpx solid $color-laoke;
  padding: 24rpx 28rpx;
  box-shadow: $shadow-sm;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  flex-wrap: wrap;
  transition: background-color 0.3s ease, border-left-color 0.3s ease;
}
.bubble.thinking {
  background-color: $color-surface-subtle;
  border-left-color: $color-text-disabled;
}
.bubble.streaming {
  // streaming 时边条变深紫(从 $color-accent 茶棕改 $color-laoke-deep,统一双色系)
  border-left-color: $color-laoke-deep;
}

.text-segments {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  width: 100%;
}
.text {
  font-size: 34rpx;
  line-height: 1.6;
  color: $color-text-primary;
  white-space: pre-wrap;
}

// === 话术 chip(可复制高亮块,spec-009)===
.quote-chip {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 16rpx 20rpx;
  margin: 6rpx 0;
  border-radius: 16rpx;
  background-color: rgba(217, 165, 78, 0.12); // 暖金黄淡(跟"已收藏"星色同源,提示这是可拿走的内容)
  border: 1rpx solid rgba(217, 165, 78, 0.3);
  transition: background-color 0.18s, transform 0.12s;

  &:active {
    background-color: rgba(217, 165, 78, 0.22);
    transform: scale(0.98);
  }
}
.quote-chip-text {
  flex: 1;
  font-size: 32rpx;
  color: $color-text-primary;
  line-height: 1.5;
  font-weight: $weight-medium;
  letter-spacing: 0.5rpx;
}
.quote-chip-action {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6rpx;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  background-color: rgba(217, 165, 78, 0.2);
  color: #C68B2E;
  flex-shrink: 0;
}
.quote-chip-action-text {
  font-size: 22rpx;
  color: #C68B2E;
  font-weight: $weight-medium;
}

.caret {
  display: inline-block;
  margin-left: 4rpx;
  font-size: 34rpx;
  line-height: 1.6;
  color: $color-accent;
  font-weight: $weight-medium;
  animation: caret-blink 1.05s steps(1) infinite;
  transform: translateY(-1rpx);
}
@keyframes caret-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

// v4 思考态:dots + 文字标签同行,柔粉色系跟老白人格呼应
.thinking-wrap {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  padding: 4rpx 0;
}
.thinking-dots {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background-color: $color-primary;  // v4 柔粉(原 text-tertiary 灰)
  margin-right: 8rpx;
  animation: bounce 1.4s infinite ease-in-out;

  &:last-child { margin-right: 0; }
}
.dot:nth-child(2) { animation-delay: 0.18s; }
.dot:nth-child(3) { animation-delay: 0.36s; }
@keyframes bounce {
  0%, 80%, 100% { opacity: 0.35; transform: translateY(0) scale(0.85); }
  40% { opacity: 1; transform: translateY(-6rpx) scale(1); }
}
// "老白深思" 文字标签 — 浅粉色弱出场,呼吸感 + 切换时淡入(v-key 触发重渲染)
.thinking-label {
  font-size: 24rpx;
  color: $color-primary-deep;
  letter-spacing: 1rpx;
  font-weight: $weight-medium;
  opacity: 0.7;
  animation:
    thinking-label-pulse 1.8s infinite ease-in-out,
    thinking-label-in 0.5s ease both; // 切 phrase 时柔和淡入
}
@keyframes thinking-label-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.85; }
}
@keyframes thinking-label-in {
  from { opacity: 0; transform: translateY(4rpx); }
  to { opacity: 0.7; transform: translateY(0); }
}

// === spec-009 反馈区 — 单行文字链风,跟 detail.vue quote-feedback / extract-link 同款 ===
.feedback-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 14rpx;
  margin-top: 14rpx;
  padding-left: 6rpx;
  white-space: nowrap;
}
.fb-link {
  font-size: 24rpx;
  color: $color-text-tertiary;
  line-height: 1.2;
  font-weight: $weight-medium;
  letter-spacing: 0.2rpx;
  padding: 4rpx 0;
  transition: color 0.18s, opacity 0.12s;

  &:active { opacity: 0.55; }
}
.fb-sep {
  font-size: 20rpx;
  color: $color-text-disabled;
  line-height: 1;
}

// 选中态只换色,无背景框,保持文字链感
.fb-link-like { color: $color-success; }
.fb-link-dislike { color: $color-danger; }
.fb-link-comment { color: $color-accent; }

/* Nikita #1 dislike chips — 点"不对劲"展开 4 个 chip 选具体原因 */
.dislike-chips-wrap {
  margin-top: 16rpx;
  padding: 16rpx 16rpx 12rpx;
  background: rgba(245, 63, 63, 0.06);
  border-radius: 16rpx;
  animation: dislike-chips-in 0.2s cubic-bezier(0.32, 0.72, 0, 1) both;
}
@keyframes dislike-chips-in {
  from { opacity: 0; transform: translateY(-4rpx); }
  to { opacity: 1; transform: translateY(0); }
}
.dislike-chips-title {
  display: block;
  font-size: 22rpx;
  color: $color-text-tertiary;
  margin-bottom: 12rpx;
}
.dislike-chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}
.dislike-chip {
  padding: 10rpx 22rpx;
  background: $color-surface;
  border: 1rpx solid rgba(245, 63, 63, 0.25);
  border-radius: 9999rpx;
  transition: transform 0.12s, background 0.15s;
}
.dislike-chip:active {
  transform: scale(0.94);
  background: rgba(245, 63, 63, 0.08);
}
.dislike-chip-skip {
  border-color: $color-border;
}
.dislike-chip-text {
  font-size: 22rpx;
  color: $color-danger;
  font-weight: $weight-medium;
}
.dislike-chip-skip .dislike-chip-text {
  color: $color-text-tertiary;
}

// 气泡下时间小字(老白气泡左对齐)
.bubble-time {
  display: block;
  margin-top: 8rpx;
  padding-left: 6rpx;
  font-size: 20rpx;
  color: $color-text-tertiary;
  letter-spacing: 0.2rpx;
}

// === 评论 modal ===
.cm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.cm-scrim {
  position: absolute;
  inset: 0;
  background-color: rgba(20, 24, 31, 0.45);
  animation: cm-fade 0.2s ease both;
}
@keyframes cm-fade { from { opacity: 0; } to { opacity: 1; } }
.cm-card {
  position: relative;
  background-color: $color-background;
  border-radius: 48rpx 48rpx 0 0;
  padding: 16rpx 48rpx calc(env(safe-area-inset-bottom, 32rpx) + 32rpx);
  animation: cm-slide 0.3s cubic-bezier(0.32, 0.72, 0, 1) both;
}
@keyframes cm-slide { from { transform: translateY(100%); } to { transform: translateY(0); } }
.cm-handle {
  width: 72rpx;
  height: 8rpx;
  background-color: $color-border;
  border-radius: 999rpx;
  margin: 0 auto 24rpx;
}
.cm-title {
  display: block;
  font-size: 32rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  margin-bottom: 8rpx;
}
.cm-sub {
  display: block;
  font-size: 24rpx;
  color: $color-text-tertiary;
  margin-bottom: 24rpx;
}
.cm-input {
  width: 100%;
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  font-size: 28rpx;
  color: $color-text-primary;
  min-height: 160rpx;
  margin-bottom: 24rpx;
  line-height: 1.5;
}
.cm-actions {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
}
.cm-cancel {
  flex: 1;
  height: 88rpx;
  background-color: transparent;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;

  &:active { background-color: $color-surface-subtle; }
}
.cm-cancel-text {
  font-size: 28rpx;
  color: $color-text-secondary;
}
.cm-submit {
  flex: 1;
  height: 88rpx;
  background-color: $color-primary;
  border-radius: $radius-md;  // 20rpx → token $radius-md(16rpx),全局统一
  display: flex;
  align-items: center;
  justify-content: center;

  &:active { background-color: $color-primary-deep; }
}
.cm-submit-text {
  font-size: 28rpx;
  color: $color-surface;
  font-weight: $weight-medium;
}
</style>
