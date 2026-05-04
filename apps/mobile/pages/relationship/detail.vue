<script setup lang="ts">
// 关系档案 = "老 K 写给你的关于这段关系的一本书"(2026-05-04 调研后重定位)
//
// 三个心理位置(她 / 我们 / 工具箱):
//   - 她:对方画像(老 K 累积观察 + 你提醒老 K 的)
//   - 我们:关系演变叙事(月度老 K 写的一段话 + 关键时刻卡)— 这是复盘的真正价值
//   - 工具箱:收藏的话术 + 方向(具象产物)
//
// 核心认知:用户珍视的是"被见证 + 叙事可读性",不是"成长曲线"或"健康度评分"
// 调研依据:Hawthorne 效应 / 叙事疗法 / Spotify Wrapped 模式 / Replika Level 反例

import { onMounted, ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useRelationshipStore } from '../../stores/relationship'
import { useConversationStore } from '../../stores/conversation'
import RelationshipAvatar from '../../components/RelationshipAvatar.vue'
import { RELATIONSHIP_STAGE_LABELS, type Relationship } from '../../types/relationship'

const store = useRelationshipStore()
const conversationStore = useConversationStore()

const id = ref('')

onLoad((opts) => {
  id.value = (opts?.id as string) ?? ''
})

onMounted(async () => {
  if (id.value) {
    // 确保 store 已加载,reactive 后 relationship computed 自动更新
    if (store.items.length === 0) await store.fetchList()
    if (!store.findById(id.value)) await store.fetchOne(id.value)
    conversationStore.loadConversation(id.value)
  }
})

// 改用 computed,update 后自动 reactive
const relationship = computed<Relationship | null>(
  () => store.findById(id.value) ?? null,
)

const stageLabel = computed(() =>
  relationship.value ? RELATIONSHIP_STAGE_LABELS[relationship.value.stage] : '',
)

const daysSinceCreated = computed(() => {
  if (!relationship.value) return 0
  return Math.floor(
    (Date.now() - new Date(relationship.value.created_at).getTime()) / 86400_000,
  )
})

// 最近一次复盘距今(用对话流最新非 system 消息的时间近似)
const lastTalkAgo = computed(() => {
  const t = conversationStore.latestTime(id.value)
  if (!t) return null
  const days = Math.floor((Date.now() - new Date(t).getTime()) / 86400_000)
  if (days < 1) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  return `${Math.floor(days / 30)} 个月前`
})

// === Tab 切换 ===
type Tab = 'her' | 'us' | 'toolbox'
const activeTab = ref<Tab>('her')

// === Tab 1: 她 - 4 个 section(信息架构调研落地) ===

// L1 名片字段(从 basic_facts 提取展示)
const howWeMet = computed(() =>
  (relationship.value?.basic_facts as any)?.how_we_met ?? '',
)
const ageRangeLabel = computed(() => {
  const ar = (relationship.value?.basic_facts as any)?.age_range
  if (!ar) return ''
  const map: Record<string, string> = {
    same: '同龄', older: '比我大', younger: '比我小',
  }
  return map[ar] ?? ar
})

// L3 老 K 看见的(M1 mock,M2 由 Profile Updater 自动)
const laokeObservations = ref<Array<{ text: string; recordedDaysAgo: number }>>([
  {
    text: '她不喜欢被催着回消息——你一晚上发 4 条她次日才一起回。',
    recordedDaysAgo: 3,
  },
  {
    text: '每次提到她姐姐她语气会变得轻一点,这事在她心里有重量。',
    recordedDaysAgo: 3,
  },
])

// L2 你告诉老 K 的(key_facts + user_reminders 合并展示成 chip,带来源标记)
interface ChipItem {
  text: string
  source: 'fact' | 'reminder'
}
const userKnownChips = computed<ChipItem[]>(() => {
  if (!relationship.value) return []
  const facts = ((relationship.value.basic_facts as any)?.key_facts ?? []) as string[]
  const reminders = relationship.value.user_reminders ?? []
  return [
    ...facts.map((t) => ({ text: t, source: 'fact' as const })),
    ...reminders.map((t) => ({ text: t, source: 'reminder' as const })),
  ]
})

// 删除某个 chip
async function removeChip(item: ChipItem) {
  if (!relationship.value) return
  uni.showModal({
    title: '删掉这条?',
    content: `"${item.text}"`,
    confirmText: '删掉',
    confirmColor: '#B84A4A',
    success: async (res) => {
      if (!res.confirm || !relationship.value) return
      if (item.source === 'fact') {
        const facts = ((relationship.value.basic_facts as any)?.key_facts ?? []) as string[]
        const newFacts = facts.filter((t) => t !== item.text)
        await store.update(relationship.value.id, {
          basic_facts: { ...(relationship.value.basic_facts as any), key_facts: newFacts },
        })
      } else {
        const reminders = relationship.value.user_reminders ?? []
        const newReminders = reminders.filter((t) => t !== item.text)
        await store.update(relationship.value.id, { user_reminders: newReminders })
      }
    },
  })
}

// === 添加新 chip 的轻量底部 modal(替代跳 edit 表单) ===
const addModalOpen = ref(false)
const newChipText = ref('')

function openAddModal() {
  newChipText.value = ''
  addModalOpen.value = true
}
function closeAddModal() {
  addModalOpen.value = false
}
async function confirmAddChip() {
  const text = newChipText.value.trim()
  if (!text || !relationship.value) return
  const reminders = relationship.value.user_reminders ?? []
  await store.update(relationship.value.id, {
    user_reminders: [...reminders, text],
  })
  closeAddModal()
  uni.showToast({ title: '记下了', icon: 'none', duration: 1200 })
}

// 暴露未知项:老 K 还想知道的(关键创新)
// 调研依据:Schilke & Reimann (OBHDP 2025) — 暴露"我不知道"反而构建信任
//          Ben Franklin 效应 — 让对方帮一个小忙增加投入
const unknownPrompts = computed<string[]>(() => {
  const name = relationship.value?.name ?? '她'
  return [
    `${name}最近忙什么?`,
    '你们上次聊得最开心是什么时候?',
    `${name}讨厌别人怎么对她?`,
  ]
})

function jumpToConversationWithHint(_prompt: string) {
  // M1 简化:跳到对话窗;M2 可让老 K 自动以 prompt 主动追问
  uni.navigateTo({ url: `/pages/relationship/conversation?id=${id.value}` })
}

function addToldFact() {
  // 改为弹底部轻量 modal,不跳完整 edit 表单
  openAddModal()
}

// === Tab 2: 我们 - 关系演变叙事(M1 mock,M2 接 LLM 后老 K 月度自动写) ===
// 这是调研建议的"老 K 写给你的一段月度叙事"
const usNarrative = ref<string>(
  `刚跟你聊上她的时候,你最焦虑的事是"她不回信息我做错了什么"。
那时候你跟我反复看那一句"先这样吧",看了好几遍。

这周你给我看的截图里,她主动问你周末干嘛。
你说你"反应没那么大了"——这话我记下了。

我看着像两件事:她那边有点松,你这边稳了一点。`,
)

// 关键时刻(M1 mock,M2 接老 K 自动从对话流摘要)
interface KeyMoment {
  id: string
  date: string  // ISO
  title: string  // 老 K 给的简短标题
  detail: string  // 1-2 句详细
}
// 倒序展示(最近在前):最近发生的事 = 当下最重要
// M2 会加"老 K 标记的里程碑"权重(告白/第一次约会等可置顶)
const keyMomentsRaw = ref<KeyMoment[]>([
  {
    id: 'km-1',
    date: new Date(Date.now() - 24 * 86400_000).toISOString(),
    title: '认识她',
    detail: '朋友介绍,第一次见面在咖啡馆。',
  },
  {
    id: 'km-2',
    date: new Date(Date.now() - 12 * 86400_000).toISOString(),
    title: '她主动找你聊',
    detail: '她发来一张猫的照片,你那次没急着回。',
  },
  {
    id: 'km-3',
    date: new Date(Date.now() - 3 * 86400_000).toISOString(),
    title: '已读不回那一次',
    detail: '"先这样吧"那条。老 K 帮你看了,你忍住没追问。',
  },
  {
    id: 'km-4',
    date: new Date(Date.now() - 1 * 86400_000).toISOString(),
    title: '她回话了',
    detail: '"好啊,等我下周三忙完"。她有时间锚点,不是敷衍。',
  },
])

// 按日期倒序展示(最近 → 最早)
const keyMoments = computed(() =>
  [...keyMomentsRaw.value].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  ),
)

function keyMomentDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

// === Tab 3: 工具箱 - 收藏 ===
const savedDrafts = computed(() => conversationStore.getSavedDrafts(id.value))
const savedPlannings = computed(() => conversationStore.getSavedPlannings(id.value))

function unsaveDraft(draftId: string) {
  conversationStore.unsaveDraft(id.value, draftId)
}
function copyDraftText(text: string) {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '复制了', icon: 'none' }),
  })
}

function feedbackBad(_idx: number) {
  uni.showToast({ title: '记下来了,下次会调整', icon: 'none' })
}

function goEdit() {
  uni.navigateTo({ url: `/pages/relationship/edit?mode=edit&id=${id.value}` })
}
async function archiveIt() {
  uni.showModal({
    title: '归档关系?',
    content: '归档后会从主列表消失,你可以随时从已归档恢复。',
    success: async (res) => {
      if (res.confirm) {
        await store.archive(id.value)
        uni.navigateBack()
      }
    },
  })
}
async function deleteIt() {
  uni.showModal({
    title: '删了就找不回来了',
    content: '真的要删吗?30 天内还可以恢复。',
    confirmColor: '#B84A4A',
    success: async (res) => {
      if (res.confirm) {
        const ok = await store.softDelete(id.value)
        if (ok) uni.navigateBack()
      }
    },
  })
}
</script>

<template>
  <view v-if="relationship" class="page">
    <!-- ============ Hero ============ -->
    <view class="hero">
      <RelationshipAvatar
        :name="relationship.name"
        :seed="relationship.avatar_seed"
        :size="92"
      />
      <text class="hero-name">{{ relationship.name }}</text>
      <view class="vitals">
        <text class="vital">{{ stageLabel }}</text>
        <text class="vital-sep">·</text>
        <text class="vital">第 {{ daysSinceCreated }} 天</text>
        <text v-if="lastTalkAgo" class="vital-sep">·</text>
        <text v-if="lastTalkAgo" class="vital">最近聊过 {{ lastTalkAgo }}</text>
      </view>
    </view>

    <!-- ============ Tabs ============ -->
    <view class="tabs">
      <view :class="['tab', activeTab === 'her' && 'active']" @tap="activeTab = 'her'">
        <text class="tab-text">她</text>
      </view>
      <view :class="['tab', activeTab === 'us' && 'active']" @tap="activeTab = 'us'">
        <text class="tab-text">我们</text>
      </view>
      <view :class="['tab', activeTab === 'toolbox' && 'active']" @tap="activeTab = 'toolbox'">
        <text class="tab-text">工具箱</text>
        <text v-if="savedDrafts.length + savedPlannings.length > 0" class="tab-count">
          {{ savedDrafts.length + savedPlannings.length }}
        </text>
      </view>
    </view>

    <!-- ============ Tab 1: 她(4 section 信息架构) ============ -->
    <view v-if="activeTab === 'her'" class="content">

      <!-- ===== Section 1: 名片(L1 字段) ===== -->
      <view class="section">
        <text class="section-title">名片</text>
        <view class="namecard">
          <view class="namecard-row">
            <text class="namecard-label">称呼</text>
            <text class="namecard-value">{{ relationship.name }}</text>
          </view>
          <view class="namecard-row">
            <text class="namecard-label">阶段</text>
            <text class="namecard-value">{{ stageLabel }}</text>
          </view>
          <view v-if="howWeMet" class="namecard-row">
            <text class="namecard-label">怎么认识</text>
            <text class="namecard-value">{{ howWeMet }}</text>
          </view>
          <view v-if="ageRangeLabel" class="namecard-row last">
            <text class="namecard-label">年龄段</text>
            <text class="namecard-value">{{ ageRangeLabel }}</text>
          </view>
        </view>
      </view>

      <!-- ===== Section 2: 老 K 看见的(L3 累积观察) ===== -->
      <view class="section">
        <text class="section-title">老 K 看见的</text>
        <view v-for="(obs, i) in laokeObservations" :key="i" class="quote">
          <text class="quote-text">{{ obs.text }}</text>
          <view class="quote-foot">
            <text class="quote-source">第 {{ obs.recordedDaysAgo }} 天 · 自这次复盘提取</text>
            <text class="quote-feedback" @tap="feedbackBad(i)">这条不准 →</text>
          </view>
        </view>
        <view v-if="laokeObservations.length === 0" class="empty-line">
          <text class="empty-line-text">还没看出什么,等下次复盘。</text>
        </view>
      </view>

      <!-- ===== Section 3: 你告诉老 K 的(L2 用户主动 chip) ===== -->
      <view class="section">
        <text class="section-title">你告诉老 K 的</text>
        <view v-if="userKnownChips.length > 0" class="chips">
          <view v-for="(chip, i) in userKnownChips" :key="i" class="chip">
            <text class="chip-text">{{ chip.text }}</text>
            <view class="chip-remove" @tap.stop="removeChip(chip)">
              <text class="chip-remove-icon">×</text>
            </view>
          </view>
        </view>

        <!-- 主动告诉老 K 的入口卡(L2 核心收集机制) -->
        <view class="add-knowledge" @tap="addToldFact">
          <view class="add-knowledge-left">
            <view class="add-knowledge-icon">
              <text class="add-knowledge-icon-text">+</text>
            </view>
            <view class="add-knowledge-text">
              <text class="add-knowledge-title">想到啥都告诉老 K</text>
              <text class="add-knowledge-sub">她最近在忙啥 · 她讨厌啥 · 她朋友圈最近发啥</text>
            </view>
          </view>
          <text class="add-knowledge-arrow">›</text>
        </view>

        <text class="add-knowledge-tip">越多老 K 越懂她,反馈越准。</text>
      </view>

      <!-- ===== Section 4: 老 K 还想知道的(暴露未知项 — 关键创新) ===== -->
      <view class="section">
        <text class="section-title">老 K 还想知道的</text>
        <view
          v-for="(p, i) in unknownPrompts"
          :key="i"
          class="unknown-item"
          @tap="jumpToConversationWithHint(p)"
        >
          <text class="unknown-bullet">·</text>
          <text class="unknown-text">{{ p }}</text>
          <text class="unknown-arrow">去说 →</text>
        </view>
      </view>
    </view>

    <!-- ============ Tab 2: 我们(关系演变叙事 = 复盘的真正价值) ============ -->
    <view v-if="activeTab === 'us'" class="content">
      <!-- 老 K 写的月度叙事 -->
      <view class="narrative">
        <view class="narrative-head">
          <text class="narrative-label">老 K 给你写的</text>
          <text class="narrative-date">这一个月</text>
        </view>
        <text class="narrative-text">{{ usNarrative }}</text>
      </view>

      <!-- 关键时刻 -->
      <view class="section" style="margin-top: 48rpx">
        <text class="section-title">这一段走过的</text>
        <view class="timeline">
          <view
            v-for="(km, idx) in keyMoments"
            :key="km.id"
            class="moment"
          >
            <view class="moment-rail">
              <view class="moment-dot"></view>
              <view v-if="idx < keyMoments.length - 1" class="moment-line"></view>
            </view>
            <view class="moment-content">
              <text class="moment-date">{{ keyMomentDate(km.date) }}</text>
              <text class="moment-title">{{ km.title }}</text>
              <text class="moment-detail">{{ km.detail }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- ============ Tab 3: 工具箱 ============ -->
    <view v-if="activeTab === 'toolbox'" class="content">
      <!-- 收藏的话术 -->
      <view class="section">
        <text class="section-title">收藏的话术 ({{ savedDrafts.length }})</text>
        <view v-if="savedDrafts.length === 0" class="empty-line">
          <text class="empty-line-text">和老 K 聊的时候,觉得哪句好用就点 ☆ 收藏。</text>
        </view>
        <view v-else>
          <view v-for="d in savedDrafts" :key="d.id" class="saved-card">
            <view class="saved-card-head">
              <text class="saved-card-direction">{{ d.direction }}</text>
              <view class="saved-card-unsave" @tap="unsaveDraft(d.id)">
                <text class="saved-card-unsave-icon">★</text>
              </view>
            </view>
            <view class="saved-card-text" @tap="copyDraftText(d.text)">
              <text class="saved-text">{{ d.text }}</text>
              <text class="saved-copy">点击复制 ⧉</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 收藏的方向 -->
      <view class="section">
        <text class="section-title">收藏的方向 ({{ savedPlannings.length }})</text>
        <view v-if="savedPlannings.length === 0" class="empty-line">
          <text class="empty-line-text">老 K 给的"做什么/为什么/红线/退路",觉得有用就点 ☆。</text>
        </view>
        <view v-else>
          <view v-for="p in savedPlannings" :key="p.id" class="saved-card">
            <text class="saved-planning-title">{{ p.content.title }}</text>
            <view class="saved-planning-section">
              <text class="saved-planning-label">做什么</text>
              <text class="saved-planning-content">{{ p.content.what_to_do }}</text>
            </view>
            <view class="saved-planning-section">
              <text class="saved-planning-label">为什么</text>
              <text class="saved-planning-content">{{ p.content.why }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 添加 chip 的底部 modal(轻量,替代跳 edit 表单) -->
    <view v-if="addModalOpen" class="add-modal-overlay">
      <view class="add-modal-scrim" @tap="closeAddModal"></view>
      <view class="add-modal">
        <view class="add-modal-handle"></view>
        <text class="add-modal-title">告诉老 K 一件她的事</text>
        <text class="add-modal-sub">越具体越好——她最近的一件小事 / 你刚发现的</text>
        <textarea
          class="add-modal-input"
          v-model="newChipText"
          placeholder="比如:她最近在忙年底 KPI"
          maxlength="200"
          :auto-height="true"
          :focus="true"
        />
        <view class="add-modal-buttons">
          <view class="add-modal-cancel" @tap="closeAddModal">
            <text class="add-modal-cancel-text">先不说</text>
          </view>
          <view
            :class="['add-modal-confirm', !newChipText.trim() && 'disabled']"
            @tap="confirmAddChip"
          >
            <text class="add-modal-confirm-text">告诉老 K</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 页脚淡化文字链 -->
    <view class="footer-links">
      <text class="footer-link" @tap="goEdit">编辑档案</text>
      <text class="footer-sep">·</text>
      <text class="footer-link" @tap="archiveIt">归档</text>
      <text class="footer-sep">·</text>
      <text class="footer-link danger" @tap="deleteIt">删除整段关系</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $color-background;
  padding-bottom: 64rpx;
}

// === Hero ===
.hero {
  padding: 64rpx 48rpx 36rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.hero-name {
  margin-top: 32rpx;
  font-size: 52rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  letter-spacing: -1rpx;
}
.vitals {
  margin-top: 16rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
}
.vital { font-size: 24rpx; color: $color-text-tertiary; }
.vital-sep { font-size: 24rpx; color: $color-text-disabled; margin: 0 12rpx; }

// === Tabs ===
.tabs {
  display: flex;
  flex-direction: row;
  padding: 0 48rpx;
  border-bottom: 1rpx solid $color-border;
  margin-bottom: 16rpx;
}
.tab {
  flex: 1;
  padding: 24rpx 8rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  position: relative;
  &:active { opacity: 0.6; }
}
.tab-text {
  font-size: 28rpx;
  color: $color-text-tertiary;
  font-weight: $weight-medium;
}
.tab-count {
  margin-left: 8rpx;
  font-size: 22rpx;
  color: $color-text-disabled;
}
.tab.active .tab-text {
  color: $color-text-primary;
  font-weight: $weight-semibold;
}
.tab.active::after {
  content: '';
  position: absolute;
  bottom: -1rpx;
  left: 24rpx;
  right: 24rpx;
  height: 4rpx;
  background-color: $color-primary;
  border-radius: 4rpx 4rpx 0 0;
}

// === 内容 ===
.content { padding: 32rpx 48rpx; }
.section { margin-bottom: 48rpx; }
.section-title {
  display: block;
  font-size: 24rpx;
  font-weight: $weight-medium;
  color: $color-text-tertiary;
  letter-spacing: 1.5rpx;
  margin-bottom: 24rpx;
}

// === 老 K 引文(她 Tab) ===
.quote {
  position: relative;
  padding-left: 28rpx;
  padding-bottom: 32rpx;
}
.quote::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12rpx;
  bottom: 28rpx;
  width: 2rpx;
  background-color: $color-accent;
  opacity: 0.5;
}
.quote-text {
  display: block;
  font-size: 32rpx;
  color: $color-text-secondary;
  line-height: 1.7;
  margin-bottom: 12rpx;
}
.quote-foot {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.quote-source {
  font-size: 22rpx;
  color: $color-text-disabled;
}
.quote-feedback {
  font-size: 22rpx;
  color: $color-text-disabled;
  &:active { color: $color-accent; }
}

// === 名片 ===
.namecard {
  background-color: $color-surface;
  border: 1rpx solid $color-border;
  border-radius: 24rpx;
  padding: 8rpx 28rpx;
}
.namecard-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding: 20rpx 0;
  border-bottom: 1rpx solid $color-border;
  &.last { border-bottom: none; }
}
.namecard-label {
  width: 144rpx;
  flex-shrink: 0;
  font-size: 24rpx;
  color: $color-text-tertiary;
  padding-top: 4rpx;
}
.namecard-value {
  flex: 1;
  font-size: 28rpx;
  color: $color-text-primary;
  line-height: 1.5;
}

// === Chips(你告诉老 K 的) ===
.chips {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 16rpx;
}
.chip {
  background-color: $color-accent-subtle;
  border-radius: 999rpx;
  padding: 12rpx 16rpx 12rpx 24rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
}
.chip-text {
  font-size: 24rpx;
  color: $color-accent;
}
.chip-remove {
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;

  &:active { background-color: rgba(168, 124, 95, 0.25); }
}
.chip-remove-icon {
  font-size: 26rpx;
  color: $color-accent;
  line-height: 1;
}
// 主动告诉老 K(L2 核心入口,视觉权重更高)
.add-knowledge {
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: $color-accent-subtle;
  border: 2rpx solid rgba(168, 124, 95, 0.35);
  border-radius: 24rpx;
  padding: 24rpx 28rpx;
  margin-top: 16rpx;

  &:active {
    background-color: rgba(168, 124, 95, 0.18);
    transform: scale(0.99);
  }
}
.add-knowledge-left {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  min-width: 0;
}
.add-knowledge-icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: $color-accent;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 24rpx;
}
.add-knowledge-icon-text {
  color: $color-background;
  font-size: 36rpx;
  font-weight: $weight-medium;
  line-height: 1;
}
.add-knowledge-text { flex: 1; min-width: 0; }
.add-knowledge-title {
  display: block;
  font-size: 30rpx;
  font-weight: $weight-semibold;
  color: $color-text-primary;
  margin-bottom: 6rpx;
}
.add-knowledge-sub {
  display: block;
  font-size: 22rpx;
  color: $color-text-tertiary;
  line-height: 1.5;
}
.add-knowledge-arrow {
  font-size: 36rpx;
  color: $color-accent;
  margin-left: 16rpx;
  flex-shrink: 0;
  line-height: 1;
}
.add-knowledge-tip {
  display: block;
  margin-top: 14rpx;
  padding: 0 8rpx;
  font-size: 22rpx;
  color: $color-text-tertiary;
  font-style: italic;
  line-height: 1.5;
}

// === 暴露未知项(关键创新) ===
.unknown-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid $color-border;

  &:last-child { border-bottom: none; }
  &:active { opacity: 0.6; }
}
.unknown-bullet {
  width: 24rpx;
  flex-shrink: 0;
  font-size: 32rpx;
  color: $color-accent;
  line-height: 1.4;
}
.unknown-text {
  flex: 1;
  font-size: 28rpx;
  color: $color-text-secondary;
  line-height: 1.5;
}
.unknown-arrow {
  font-size: 22rpx;
  color: $color-accent;
  margin-left: 12rpx;
  flex-shrink: 0;
}

// === "我们" Tab ===
.narrative {
  background-color: $color-surface;
  border-radius: 28rpx;
  border-left: 4rpx solid $color-accent;
  padding: 36rpx 40rpx;
  box-shadow: $shadow-sm;
}
.narrative-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.narrative-label {
  font-size: 22rpx;
  color: $color-accent;
  font-weight: $weight-medium;
  letter-spacing: 1rpx;
}
.narrative-date {
  font-size: 22rpx;
  color: $color-text-tertiary;
}
.narrative-text {
  font-size: 32rpx;        // 16pt
  color: $color-text-primary;
  line-height: 1.75;
  white-space: pre-wrap;
}

// === 关键时刻 timeline ===
.timeline { padding: 8rpx 0 0; }
.moment {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding: 4rpx 0;
}
.moment-rail {
  width: 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  padding-top: 12rpx;
}
.moment-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background-color: $color-accent;
  flex-shrink: 0;
}
.moment-line {
  flex: 1;
  width: 1rpx;
  background-color: $color-border;
  margin-top: 4rpx;
  min-height: 80rpx;
}
.moment-content {
  flex: 1;
  padding: 4rpx 0 32rpx 16rpx;
}
.moment-date {
  display: block;
  font-size: 22rpx;
  color: $color-text-tertiary;
  margin-bottom: 6rpx;
}
.moment-title {
  display: block;
  font-size: 30rpx;
  color: $color-text-primary;
  font-weight: $weight-semibold;
  margin-bottom: 6rpx;
  line-height: 1.3;
}
.moment-detail {
  display: block;
  font-size: 26rpx;
  color: $color-text-secondary;
  line-height: 1.55;
}

// === 工具箱 Tab ===
.empty-line { padding: 8rpx 0; }
.empty-line-text {
  font-size: 26rpx;
  color: $color-text-tertiary;
  line-height: 1.6;
}

.saved-card {
  background-color: $color-surface;
  border: 1rpx solid $color-border;
  border-radius: 24rpx;
  padding: 28rpx 32rpx;
  margin-bottom: 20rpx;
}
.saved-card-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.saved-card-direction {
  font-size: 26rpx;
  font-weight: $weight-semibold;
  color: $color-primary;
}
.saved-card-unsave {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  &:active { background-color: $color-surface-subtle; }
}
.saved-card-unsave-icon {
  font-size: 32rpx;
  color: $color-accent;
  line-height: 1;
}
.saved-card-text {
  background-color: $color-surface-subtle;
  border-radius: 16rpx;
  padding: 24rpx 28rpx;
  &:active { background-color: $color-primary-subtle; }
}
.saved-text {
  display: block;
  font-size: 30rpx;
  line-height: 1.55;
  color: $color-text-primary;
  margin-bottom: 8rpx;
}
.saved-copy {
  font-size: 22rpx;
  color: $color-accent;
}
.saved-planning-title {
  display: block;
  font-size: 32rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  margin-bottom: 16rpx;
}
.saved-planning-section { margin-bottom: 12rpx; }
.saved-planning-label {
  display: block;
  font-size: 22rpx;
  color: $color-accent;
  font-weight: $weight-medium;
  margin-bottom: 4rpx;
}
.saved-planning-content {
  display: block;
  font-size: 28rpx;
  color: $color-text-primary;
  line-height: 1.5;
}

// 添加 chip 底部 modal
.add-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.add-modal-scrim {
  position: absolute;
  inset: 0;
  background-color: rgba(20, 24, 31, 0.45);
  animation: fadeIn 0.2s ease both;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.add-modal {
  position: relative;
  background-color: $color-background;
  border-radius: 48rpx 48rpx 0 0;
  padding: 16rpx 48rpx calc(env(safe-area-inset-bottom, 32rpx) + 32rpx);
  animation: slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1) both;
}
@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.add-modal-handle {
  width: 72rpx;
  height: 8rpx;
  background-color: $color-border;
  border-radius: 999rpx;
  margin: 0 auto 24rpx;
}
.add-modal-title {
  display: block;
  font-size: 32rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  margin-bottom: 8rpx;
}
.add-modal-sub {
  display: block;
  font-size: 24rpx;
  color: $color-text-tertiary;
  margin-bottom: 24rpx;
  line-height: 1.5;
}
.add-modal-input {
  width: 100%;
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  font-size: 30rpx;
  color: $color-text-primary;
  min-height: 160rpx;
  margin-bottom: 24rpx;
  line-height: 1.5;
}
.add-modal-buttons {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
}
.add-modal-cancel {
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
.add-modal-cancel-text {
  font-size: 28rpx;
  color: $color-text-secondary;
}
.add-modal-confirm {
  flex: 1;
  height: 88rpx;
  background-color: $color-accent;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;

  &.disabled { opacity: 0.4; }
  &:not(.disabled):active { background-color: $color-accent-soft; }
}
.add-modal-confirm-text {
  font-size: 28rpx;
  font-weight: $weight-medium;
  color: $color-background;
}

// 页脚
.footer-links {
  margin-top: 96rpx;
  padding: 32rpx 48rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}
.footer-link {
  font-size: 24rpx;
  color: $color-text-tertiary;
  padding: 12rpx 16rpx;
  &:active { color: $color-text-primary; }
}
.footer-link.danger {
  color: rgba(184, 74, 74, 0.6);
  &:active { color: $color-danger; }
}
.footer-sep {
  font-size: 22rpx;
  color: $color-text-disabled;
}
</style>
