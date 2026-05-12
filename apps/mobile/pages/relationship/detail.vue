<script setup lang="ts">
// 关系档案 = "老白写给你的关于这段关系的一本书"(2026-05-04 调研后重定位)
//
// 三个心理位置(她 / 我们 / 工具箱):
//   - 她:对方画像(老白累积观察 + 你提醒老白的)
//   - 我们:关系演变叙事(月度老白写的一段话 + 关键时刻卡)— 这是复盘的真正价值
//   - 工具箱:收藏的话术 + 方向(具象产物)
//
// 核心认知:用户珍视的是"被见证 + 叙事可读性",不是"成长曲线"或"健康度评分"
// 调研依据:Hawthorne 效应 / 叙事疗法 / Spotify Wrapped 模式 / Replika Level 反例

import { onMounted, ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useRelationshipStore } from '../../stores/relationship'
import { useConversationStore } from '../../stores/conversation'
import { useRelationshipSignalsStore } from '../../stores/relationship-signals'
import { useAppDialog } from '../../composables/useAppDialog'
import RelationshipAvatar from '../../components/RelationshipAvatar.vue'
import { RELATIONSHIP_STAGE_LABELS, type Relationship } from '../../types/relationship'
import type { RelationshipSignalSnapshot, SignalDimension } from '../../utils/signal-computer'

const store = useRelationshipStore()
const conversationStore = useConversationStore()
const signalsStore = useRelationshipSignalsStore()
const dialog = useAppDialog()

const id = ref('')

onLoad((opts) => {
  id.value = (opts?.id as string) ?? ''
  // 从 conversation.vue 顶部 ⋯ 跳过来时,带 tab=us 直接落到"我们"Tab(老白看到的)
  const t = (opts?.tab as string) ?? ''
  if (t === 'her' || t === 'us' || t === 'toolbox' || t === 'grow') activeTab.value = t
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
// 默认 'us'(我们):整页核心是关系演变 + "老白看到的",这是产品独有价值,
// "她"是档案、"工具箱"是收藏、"成长"是北极星 + 被见证叙事,都不该是 first impression。
type Tab = 'her' | 'us' | 'toolbox' | 'grow'
const activeTab = ref<Tab>('us')

// === Tab 4: 成长 — 被见证型叙事(2026-05-12 加)===
// 注:遵守 detail.vue 顶部原则 — "用户珍视的是被见证 + 叙事可读性,不是成长曲线或健康度评分"
// 所以不堆"已聊 N 次 / 信号分 / 进度条",只用一个 daysSinceCreated 做语境化叙事
const growthNarrative = computed(() => {
  const d = daysSinceCreated.value
  const name = relationship.value?.name ?? '她'
  if (d <= 0) {
    return `你才刚把 ${name} 记下来。能开口愿意试,这就是开始。`
  }
  if (d < 7) {
    return `认识 ${name} 没几天,你已经愿意来这儿想想她、想想自己。这步多数人迈不出来。`
  }
  if (d < 30) {
    return `跟 ${name} 走过这小一个月。你不是去搞她,也没躲着她——这事不容易。`
  }
  if (d < 90) {
    return `跟 ${name} 一来一回这么久,你在练自己。心里那个删了又改的自己,慢慢能放过了。`
  }
  return `跟 ${name} 走到现在,你跟当初那个对着对话框删了又改的自己,已经不是同一个人了。`
})

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

// (spec-009 audit:删除原 hardcoded mock"老白看见的"。真信号在"我们"Tab verdict-card,
//  抽取的 facts 在 Section 3"你告诉老白的"chips 里展示)

// L2 你告诉老白的(key_facts + user_reminders 合并展示成 chip,带来源标记)
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
// spec-008 Phase 2.3:fact 删除时把 text 加进 rejected_facts,下次 LLM 抽取作反例
async function removeChip(item: ChipItem) {
  if (!relationship.value) return
  const ok = await dialog.confirm('删掉这条?', {
    body: `"${item.text}"`,
    confirmText: '删掉',
    danger: true,
  })
  if (!ok || !relationship.value) return
  if (item.source === 'fact') {
    const bf = (relationship.value.basic_facts as any) ?? {}
    const facts = (bf.key_facts ?? []) as string[]
    const rejected = (bf.rejected_facts ?? []) as string[]
    const newRejected = rejected.includes(item.text) ? rejected : [...rejected, item.text]
    await store.update(relationship.value.id, {
      basic_facts: {
        ...bf,
        key_facts: facts.filter((t) => t !== item.text),
        rejected_facts: newRejected.slice(-50),
      },
    })
  } else {
    const reminders = relationship.value.user_reminders ?? []
    const newReminders = reminders.filter((t) => t !== item.text)
    await store.update(relationship.value.id, { user_reminders: newReminders })
  }
}

// === spec-008 Phase 2.2 待确认区(low confidence 抽取的事实)===
const pendingFacts = computed(() => {
  if (!relationship.value) return []
  return ((relationship.value.basic_facts as any)?.pending_facts ?? []) as Array<{
    text: string
    evidence_quote: string
    kind: 'background' | 'preference' | 'person' | 'event'
    captured_at: string
  }>
})

const KIND_LABEL: Record<string, string> = {
  background: '背景',
  preference: '偏好',
  person: '人',
  event: '事',
}

async function approvePending(text: string) {
  if (!relationship.value) return
  const bf = (relationship.value.basic_facts as any) ?? {}
  const pending = (bf.pending_facts ?? []) as Array<{ text: string }>
  const facts = (bf.key_facts ?? []) as string[]
  const item = pending.find((p) => p.text === text)
  if (!item) return
  await store.update(relationship.value.id, {
    basic_facts: {
      ...bf,
      key_facts: [...facts, item.text],
      pending_facts: pending.filter((p) => p.text !== text),
    },
  })
}

async function rejectPending(text: string) {
  if (!relationship.value) return
  const bf = (relationship.value.basic_facts as any) ?? {}
  const pending = (bf.pending_facts ?? []) as Array<{ text: string }>
  // spec-008 Phase 2.3 反例学习:把拒掉的事实记进 rejected_facts,
  // 下次抽取 prompt 会把这些作 negative example 传给 LLM
  const rejected = (bf.rejected_facts ?? []) as string[]
  const newRejected = rejected.includes(text) ? rejected : [...rejected, text]
  await store.update(relationship.value.id, {
    basic_facts: {
      ...bf,
      pending_facts: pending.filter((p) => p.text !== text),
      rejected_facts: newRejected.slice(-50), // 最多 50,避免无限累积
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

// Phase 2.5:暴露未知项 LLM 化(默认 fallback,LLM 生成成功后被覆盖)
const llmUnknownPrompts = ref<string[] | null>(null)
const unknownPrompts = computed<string[]>(() => {
  if (llmUnknownPrompts.value && llmUnknownPrompts.value.length > 0) {
    return llmUnknownPrompts.value
  }
  // fallback:LLM 还没生成时(冷启动 / 数据不足)用通用 prompt
  const name = relationship.value?.name ?? '她'
  return [
    `${name}最近忙什么?`,
    '你们上次聊得最开心是什么时候?',
    `${name}讨厌别人怎么对她?`,
  ]
})

function jumpToConversationWithHint(prompt: string) {
  // M3.0 (2026-05-11) 完整闭环:跳对话页 + 带 hint query
  // conversation.vue onMounted 检测到 hint 后自动 appendUserText 触发一轮 turn,
  // 老白用 # 你的局限 + 工作流程接住,不假装读心,引导兄弟去问她
  uni.navigateTo({
    url: `/pages/relationship/conversation?id=${id.value}&hint=${encodeURIComponent(prompt)}`,
  })
}

function addToldFact() {
  // 改为弹底部轻量 modal,不跳完整 edit 表单
  openAddModal()
}

// === 头像换图 + 改名(避免关系多了认错人) ===
const uploadingAvatar = ref(false)

async function pickAvatar() {
  if (!relationship.value || uploadingAvatar.value) return
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const path = (res.tempFilePaths?.[0] as string) ?? ''
      if (!path) return
      uploadingAvatar.value = true
      try {
        const { compressImageToAvatarDataUrl } = await import('../../utils/avatar-image')
        const { uploadAvatarApi } = await import('../../api/relationship.api')
        const dataUrl = await compressImageToAvatarDataUrl(path)
        // 调后端 storage:配了 Supabase 真上传返 https URL,没配 fallback 返原 dataUrl
        const upload = await uploadAvatarApi(dataUrl)
        const finalUrl = upload.ok ? upload.data.url : dataUrl
        await store.update(id.value, { avatar_url: finalUrl })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await dialog.alert('换头像失败', { body: msg })
      } finally {
        uploadingAvatar.value = false
      }
    },
    fail: () => {
      // 用户取消选图,静默
    },
  })
}

const renameModalOpen = ref(false)
const renameInput = ref('')

function openRenameModal() {
  if (!relationship.value) return
  renameInput.value = relationship.value.name
  renameModalOpen.value = true
}
function closeRenameModal() {
  renameModalOpen.value = false
}
async function confirmRename() {
  const name = renameInput.value.trim()
  if (!name || !relationship.value) {
    closeRenameModal()
    return
  }
  if (name === relationship.value.name) {
    closeRenameModal()
    return
  }
  await store.update(id.value, { name })
  closeRenameModal()
}

// === spec-008 MVP:从对话历史抽取关于"她"的稳定事实 ===
const extracting = ref(false)

async function extractFromConversation() {
  if (!relationship.value || extracting.value) return
  extracting.value = true
  try {
    const { extractProfileApi } = await import('../../api/relationship.api')
    // 收集对话历史,只取 user_text + laoke_text
    const allMsgs = conversationStore.getMessages(id.value)
    const history: Array<{ speaker: 'user' | 'laoke'; text: string }> = []
    for (const m of allMsgs) {
      if (m.type === 'user_text') {
        history.push({ speaker: 'user', text: m.text })
      } else if (m.type === 'laoke_text' && !m.is_thinking && m.text) {
        history.push({ speaker: 'laoke', text: m.text })
      }
    }
    if (history.length === 0) {
      await dialog.alert('还没素材', { body: '还没跟老白聊过她,先聊几句再来整理。' })
      return
    }
    // 后端 seed-dev 已经为每段真 dev 关系建好记录,直接传当前 id 走真 ownership 写真档案
    const res = await extractProfileApi(id.value, history)
    if (!res.ok) {
      await dialog.alert('抽取失败', { body: res.error.message })
      return
    }
    // 后端已写库 + 返回最新 relationship,前端覆盖本地 cache 即可,无需再 PATCH
    store.replaceLocalCopy(res.data.relationship)
    const added = res.data.added
    const skipped = res.data.skipped_duplicates
    if (added.length === 0) {
      await dialog.alert('整理完了', {
        body: skipped > 0 ? `没新东西可抽(跳过 ${skipped} 条已知)。` : '没新东西可抽。',
      })
    } else {
      const lines: string[] = []
      for (const f of added) {
        const tag = { background: '背景', preference: '偏好', person: '人', event: '事' }[f.kind]
        lines.push(`[${tag}] ${f.text}`)
      }
      const subtitle = skipped > 0
        ? `新增 ${added.length} 条 · 跳过 ${skipped} 条已知`
        : `新增 ${added.length} 条`
      await dialog.alert(subtitle, { body: lines.join('\n') })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await dialog.alert('抽取异常', { body: msg })
  } finally {
    extracting.value = false
  }
}

// === Tab 2: "老白现在看到的"(spec-007 信号维度,社交化叙述版,不是 dashboard)===
const signal = computed<RelationshipSignalSnapshot>(() => signalsStore.getSignal(id.value))

// 老白当下判断(替代 health 信号灯)
const laokeVerdict = computed(() => {
  const s = signal.value
  if (!s.has_enough_data) {
    return {
      tone: 'neutral' as const,
      text: `她那边的事我看到的还少,你给我多看几眼。等聊得多了,我能跟你讲点门道。`,
      sub: `目前累积 ${s.sample_size} 条,大约还差 ${Math.max(0, 12 - s.sample_size)} 条`,
    }
  }
  switch (s.health_status) {
    case 'THRIVING':
      return {
        tone: 'good' as const,
        text: '这阵子在升温——她回得勤、回得多,你这事我看有戏。',
        sub: `基于近 ${s.sample_size} 条对话`,
      }
    case 'STABLE':
      return {
        tone: 'neutral' as const,
        text: '这阵子稳着,没大波动。不冷不热,但你别误会成"快了",这就是中间地带。',
        sub: `基于近 ${s.sample_size} 条对话`,
      }
    case 'COOLING':
      return {
        tone: 'warn' as const,
        text: '她在退,但没断。这时候你别催、别试探,给她空间她反而会想起你。',
        sub: `基于近 ${s.sample_size} 条对话`,
      }
    case 'WITHDRAWING':
      return {
        tone: 'danger' as const,
        text: '她退得有点狠了。先别急着发新话题,你越追她退得越远。',
        sub: `基于近 ${s.sample_size} 条对话`,
      }
    case 'INACTIVE':
      return {
        tone: 'inactive' as const,
        text: '你们俩最近没怎么聊。先别看分析,先把对话续上。',
        sub: `最近一次对话已经 ${Math.floor((Date.now() - new Date(s.computed_at).getTime()) / 86400_000)} 天了`,
      }
  }
})

// 5 维度老白口吻观察(不要进度条 / 数字 / score)
function dimensionToObservation(label: string, d: SignalDimension): { icon: string; tone: 'up' | 'down' | 'flat'; text: string } | null {
  if (Math.abs(d.delta) < 10 && d.trend === 'flat') return null // 平稳的不说,只说有变化的
  const phrases: Record<string, { up: string; down: string }> = {
    回复速度: { up: '她回你回得比之前快了。', down: '她回得比之前慢了。' },
    回复长度: { up: '她每条比以前写得多了。', down: '她每条变短了。' },
    主动开话题: { up: '她最近开始主动找你聊了。', down: '主动开话题的次数下来了——基本都是你在推。' },
    情绪温度: { up: '她说话的口气在变软,emoji 多了点。', down: '她说话的口气冷了一点——撤回、单字回的次数上来了。' },
    节奏稳定度: { up: '聊天节奏更稳了。', down: '聊天节奏忽冷忽热,不太稳。' },
  }
  const p = phrases[label]
  if (!p) return null
  if (d.trend === 'up') return { icon: '↑', tone: 'up', text: p.up }
  if (d.trend === 'down') return { icon: '↓', tone: 'down', text: p.down }
  return null
}

interface LaokeObservation {
  icon: string
  tone: 'up' | 'down' | 'flat'
  text: string
}

const laokeSignalObs = computed<LaokeObservation[]>(() => {
  const s = signal.value
  if (!s.has_enough_data) return []
  const raw = [
    dimensionToObservation('回复速度', s.responsiveness),
    dimensionToObservation('回复长度', s.verbosity),
    dimensionToObservation('主动开话题', s.initiative),
    dimensionToObservation('情绪温度', s.warmth),
    dimensionToObservation('节奏稳定度', s.consistency),
  ]
  return raw.filter((x): x is LaokeObservation => x !== null)
})

// 兴趣度老白口吻
const laokeInterestNote = computed(() => {
  const s = signal.value
  if (!s.has_enough_data) return ''
  const d = s.interest.vs_baseline_pct
  if (d < -25) return '老白觉得 — 她对你的兴趣这阵子比之前低,不是退了,是没在升温。'
  if (d > 25) return '老白觉得 — 她对你的兴趣这阵子比之前高,有点松动了。'
  return '老白觉得 — 兴趣度跟之前接近,稳着。'
})

// === Tab 2 原:我们 - 关系演变叙事(Phase 2.5 LLM 化)===
const usNarrative = ref<string>('') // 默认空,LLM 生成后填
const insightsLoading = ref(false)

async function regenerateInsights() {
  if (!relationship.value || insightsLoading.value) return
  insightsLoading.value = true
  try {
    const { generateInsightsApi } = await import('../../api/relationship.api')
    const { serializeHistoryForLLM } = await import('../../utils/history-serializer')
    const { buildSignalBrief } = await import('../../utils/signal-to-brief')

    const all = conversationStore.getMessages(id.value)
    const history = serializeHistoryForLLM(all, {
      relationshipName: relationship.value.name,
      limit: 50,
    })
    const sig = signalsStore.getSignal(id.value)
    const signalBrief = buildSignalBrief(sig)

    const res = await generateInsightsApi(id.value, history, signalBrief)
    if (res.ok) {
      usNarrative.value = res.data.narrative
      llmUnknownPrompts.value = res.data.unknown_prompts
    } else {
      await dialog.alert('生成失败', { body: res.error.message })
    }
  } catch (e) {
    await dialog.alert('生成异常', {
      body: e instanceof Error ? e.message : String(e),
    })
  } finally {
    insightsLoading.value = false
  }
}


// === Tab 3: 工具箱 - 收藏 ===
// spec-006 重构后,savedDrafts / savedPlannings 几乎不再产生(对应旧 6 状态机产物)
// 工具箱只保留"收藏的回复"(savedQuotes) — 用户在老白气泡点 ☆ 触发
const savedQuotes = computed(() => conversationStore.getSavedQuotes(id.value))
function unsaveQuote(qid: string) {
  conversationStore.unsaveQuote(id.value, qid)
}

function copyDraftText(text: string) {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '复制了', icon: 'none' }),
  })
}

function goEdit() {
  uni.navigateTo({ url: `/pages/relationship/edit?mode=edit&id=${id.value}` })
}
async function archiveIt() {
  const ok = await dialog.confirm('归档关系?', {
    body: '归档后会从主列表消失,你可以随时从已归档恢复。',
    confirmText: '归档',
  })
  if (ok) {
    await store.archive(id.value)
    uni.navigateBack()
  }
}
async function restoreIt() {
  await store.restore(id.value)
  uni.showToast({ title: '已恢复到主列表', icon: 'none' })
  setTimeout(() => uni.navigateBack(), 600)
}
async function deleteIt() {
  const ok = await dialog.confirm('删了就找不回来了', {
    body: '真的要删吗?30 天内还可以恢复。',
    confirmText: '删除',
    danger: true,
  })
  if (ok) {
    const okDel = await store.softDelete(id.value)
    if (okDel) uni.navigateBack()
  }
}
</script>

<template>
  <view v-if="relationship" class="page">
    <!-- ============ Hero ============ -->
    <view class="hero">
      <view class="avatar-wrap" @tap="pickAvatar">
        <RelationshipAvatar
          :name="relationship.name"
          :seed="relationship.avatar_seed"
          :url="relationship.avatar_url"
          :size="92"
        />
        <view class="avatar-edit-badge">
          <text v-if="uploadingAvatar" class="avatar-edit-icon-loading">…</text>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </view>
      </view>
      <view class="hero-name-row">
        <text class="hero-name">{{ relationship.name }}</text>
        <view class="hero-name-edit" @tap="openRenameModal">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </view>
      </view>
      <view class="vitals">
        <text class="vital">{{ stageLabel }}</text>
        <text class="vital-sep">·</text>
        <text class="vital">第 {{ daysSinceCreated }} 天</text>
        <text v-if="lastTalkAgo" class="vital-sep">·</text>
        <text v-if="lastTalkAgo" class="vital">最近聊过 {{ lastTalkAgo }}</text>
      </view>
    </view>

    <!-- 改名底部 modal(复用 add-modal 视觉,跟"想到啥告诉老白"那个 modal 同款)-->
    <view v-if="renameModalOpen" class="add-modal-overlay" @tap="closeRenameModal">
      <view class="add-modal-scrim"></view>
      <view class="add-modal" @tap.stop>
        <view class="add-modal-handle"></view>
        <text class="add-modal-title">改个称呼</text>
        <text class="add-modal-sub">她叫什么,你跟我说</text>
        <input
          v-model="renameInput"
          class="rename-input-line"
          placeholder="比如 小美"
          maxlength="20"
          :focus="renameModalOpen"
          @confirm="confirmRename"
        />
        <view class="add-modal-buttons">
          <view class="add-modal-cancel" @tap="closeRenameModal">
            <text class="add-modal-cancel-text">取消</text>
          </view>
          <view class="add-modal-confirm" @tap="confirmRename">
            <text class="add-modal-confirm-text">改</text>
          </view>
        </view>
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
        <text v-if="savedQuotes.length > 0" class="tab-count">
          {{ savedQuotes.length }}
        </text>
      </view>
      <view :class="['tab', activeTab === 'grow' && 'active']" @tap="activeTab = 'grow'">
        <text class="tab-text">成长</text>
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

      <!-- spec-009 audit:删除"老白看见的"section — 之前是 hardcoded mock,
        且跟 Section 3"你告诉老白的"共享 key_facts 会重复显示,
        真信号已在"我们"Tab 顶部 verdict-card 展示 -->


      <!-- ===== Section 3: 你告诉老白的(L2 用户主动 chip + 自动抽取) ===== -->
      <view class="section">
        <text class="section-title">你告诉老白的</text>

        <!-- spec-008 Phase 2.2 待确认区:low confidence 抽取的事实,用户 ✓ 后转入正式 chips -->
        <view v-if="pendingFacts.length > 0" class="pending-block">
          <text class="pending-block-title">老白不太确定 · 你看准不准</text>
          <view v-for="p in pendingFacts" :key="p.text" class="pending-card">
            <view class="pending-card-head">
              <text class="pending-tag">{{ KIND_LABEL[p.kind] || p.kind }}</text>
              <text class="pending-text">{{ p.text }}</text>
            </view>
            <text class="pending-quote">原话:"{{ p.evidence_quote }}"</text>
            <view class="pending-actions">
              <view class="pending-btn pending-btn-reject" @tap="rejectPending(p.text)">
                <text class="pending-btn-text-reject">不准</text>
              </view>
              <view class="pending-btn pending-btn-approve" @tap="approvePending(p.text)">
                <text class="pending-btn-text-approve">✓ 收下</text>
              </view>
            </view>
          </view>
        </view>

        <view v-if="userKnownChips.length > 0" class="chips">
          <view v-for="(chip, i) in userKnownChips" :key="i" class="chip">
            <text class="chip-text">{{ chip.text }}</text>
            <view class="chip-remove" @tap.stop="removeChip(chip)">
              <text class="chip-remove-icon">×</text>
            </view>
          </view>
        </view>

        <!-- 主动告诉老白的入口卡(L2 核心收集机制) -->
        <view class="add-knowledge" @tap="addToldFact">
          <view class="add-knowledge-left">
            <view class="add-knowledge-icon">
              <text class="add-knowledge-icon-text">+</text>
            </view>
            <view class="add-knowledge-text">
              <text class="add-knowledge-title">想到啥都告诉老白</text>
              <text class="add-knowledge-sub">她最近在忙啥 · 她讨厌啥 · 她朋友圈最近发啥</text>
            </view>
          </view>
          <text class="add-knowledge-arrow">›</text>
        </view>

        <view class="extract-row">
          <text class="add-knowledge-tip">越多老白越懂她,反馈越准。</text>
          <text class="extract-link" @tap="extractFromConversation">
            {{ extracting ? '整理中…' : '从对话里整理 ↺' }}
          </text>
        </view>
      </view>

      <!-- ===== Section 4: 老白还想知道的(暴露未知项 — 关键创新) ===== -->
      <view class="section">
        <text class="section-title">老白还想知道的</text>
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
        <!-- 2026-05-11:加生成入口 — 之前默认是 3 条 hardcode fallback,
             用户必须切到 Tab 2 点"让老白写一段"才能拿到 LLM 智能生成的版本。
             现在 Tab 1 也能主动触发,且文案区分初次 vs 重生成。 -->
        <view class="extract-row">
          <text class="add-knowledge-tip">
            {{ llmUnknownPrompts ? '不准了?让老白再看看' : '默认是通用问题,让老白基于你跟她的对话定制' }}
          </text>
          <text class="extract-link" @tap="regenerateInsights">
            {{ insightsLoading ? '老白想着…' : (llmUnknownPrompts ? '再让老白看看 ↺' : '让老白看看 ↺') }}
          </text>
        </view>
      </view>
    </view>

    <!-- ============ Tab 2: 我们(关系演变叙事 = 复盘的真正价值) ============ -->
    <view v-if="activeTab === 'us'" class="content">
      <!-- 老白现在看到的(spec-007 信号,社交化叙述,不是 dashboard) -->
      <view class="laoke-verdict-card" :class="`verdict-${laokeVerdict.tone}`">
        <view class="verdict-head">
          <text class="verdict-tag">老白看到的</text>
          <text class="verdict-sub">{{ laokeVerdict.sub }}</text>
        </view>
        <text class="verdict-text">{{ laokeVerdict.text }}</text>

        <!-- 老白的具体观察(不超过 4-5 条,没变化的不说) -->
        <view v-if="laokeSignalObs.length > 0" class="observations">
          <view v-for="(o, idx) in laokeSignalObs" :key="idx" class="obs-row">
            <text :class="['obs-arrow', `arrow-${o.tone}`]">{{ o.icon }}</text>
            <text class="obs-text">{{ o.text }}</text>
          </view>
        </view>

        <!-- 兴趣度老白口吻一句话 -->
        <text v-if="laokeInterestNote" class="interest-quote">{{ laokeInterestNote }}</text>
      </view>

      <!-- 老白写的月度叙事(Phase 2.5 LLM 化) -->
      <view class="narrative" style="margin-top: 48rpx">
        <view class="narrative-head">
          <text class="narrative-label">老白给你写的</text>
          <text class="narrative-regen" @tap="regenerateInsights">
            {{ insightsLoading ? '生成中…' : (usNarrative ? '重新生成 ↺' : '让老白写一段 ↺') }}
          </text>
        </view>
        <text v-if="usNarrative" class="narrative-text">{{ usNarrative }}</text>
        <text v-else class="narrative-empty">还没写过这段关系的叙事,点上面让老白写。</text>
      </view>

    </view>

    <!-- ============ Tab 3: 工具箱 ============ -->
    <view v-if="activeTab === 'toolbox'" class="content">
      <!-- spec-009 audit:收藏的老白一段话(对话流上点 ☆ 触发) -->
      <view class="section">
        <text class="section-title">收藏的回复 ({{ savedQuotes.length }})</text>
        <view v-if="savedQuotes.length === 0" class="empty-line">
          <text class="empty-line-text">和老白聊的时候,在他回复下面点 ☆ 收藏,这里能找到。</text>
        </view>
        <view v-else>
          <view v-for="q in savedQuotes" :key="q.id" class="saved-card">
            <view class="saved-card-head">
              <text class="saved-card-direction">老白说的</text>
              <view class="saved-card-unsave" @tap="unsaveQuote(q.id)">
                <text class="saved-card-unsave-icon">★</text>
              </view>
            </view>
            <view class="saved-card-text" @tap="copyDraftText(q.text)">
              <text class="saved-text">{{ q.text }}</text>
              <text class="saved-copy">点击复制 ⧉</text>
            </view>
          </view>
        </view>
      </view>

    </view>

    <!-- ============ Tab 4: 成长(北极星 + 被见证叙事) ============ -->
    <view v-if="activeTab === 'grow'" class="content">
      <!-- 北极星三段式:学会聊天 · 学会相处 · 学会好好爱人 — 来自练爱官方简介 -->
      <view class="section">
        <text class="section-title">练爱的方向</text>
        <view class="north-star">
          <text class="north-star-line">学会聊天</text>
          <text class="north-star-dot">·</text>
          <text class="north-star-line">学会相处</text>
          <text class="north-star-dot">·</text>
          <text class="north-star-line">学会好好爱人</text>
        </view>
      </view>

      <!-- 老白寄语卡片(复用 .narrative 样式 — 卡片 + accent 边线) -->
      <view class="narrative grow-narrative">
        <view class="narrative-head">
          <text class="narrative-label">老白看你</text>
          <text class="narrative-date">认识 {{ daysSinceCreated }} 天</text>
        </view>
        <text class="narrative-text">{{ growthNarrative }}</text>
      </view>

      <!-- 老白尾巴 -->
      <text class="grow-tail">成长得慢,但一定有。</text>
    </view>

    <!-- 添加 chip 的底部 modal(轻量,替代跳 edit 表单) -->
    <view v-if="addModalOpen" class="add-modal-overlay">
      <view class="add-modal-scrim" @tap="closeAddModal"></view>
      <view class="add-modal">
        <view class="add-modal-handle"></view>
        <text class="add-modal-title">告诉老白一件她的事</text>
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
            <text class="add-modal-confirm-text">告诉老白</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 页脚淡化文字链 -->
    <view class="footer-links">
      <text class="footer-link" @tap="goEdit">编辑档案</text>
      <text class="footer-sep">·</text>
      <text v-if="relationship.archived" class="footer-link" @tap="restoreIt">恢复到主列表</text>
      <text v-else class="footer-link" @tap="archiveIt">归档</text>
      <text class="footer-sep">·</text>
      <text class="footer-link danger" @tap="deleteIt">删除整段关系</text>
    </view>
    <!-- 全局产品级 dialog 挂载点(替代 window.alert / uni.showModal) -->
    <AppDialog />
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
.avatar-wrap {
  position: relative;

  &:active { opacity: 0.85; }
}
.avatar-edit-badge {
  position: absolute;
  right: -2rpx;
  bottom: -2rpx;
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background-color: $color-surface;
  border: 2rpx solid $color-background;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: $shadow-sm;
}
.avatar-edit-badge {
  color: $color-text-secondary;
}
.avatar-edit-icon-loading {
  font-size: 22rpx;
  color: $color-text-secondary;
  line-height: 1;
}
.hero-name-row {
  margin-top: 32rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
}
.hero-name {
  font-size: 52rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  letter-spacing: -1rpx;
}
.hero-name-edit {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;

  &:active { background-color: $color-surface-subtle; }
}
.hero-name-edit {
  color: $color-text-tertiary;
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
// "你告诉老白的" 区底部,tip 跟"从对话整理"链并排,跟整页低饱和调一致
.extract-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 16rpx;
}
.extract-link {
  font-size: 24rpx;
  color: $color-text-secondary;
  font-weight: $weight-medium;
  letter-spacing: 0.2rpx;
  flex-shrink: 0;
  padding: 6rpx 0;

  &:active { opacity: 0.6; }
}

// === 老白引文(她 Tab) ===
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

// === Chips(你告诉老白的) ===
// === spec-008 Phase 2.2 待确认区 ===
.pending-block {
  margin-bottom: 24rpx;
  padding: 24rpx 28rpx;
  background-color: rgba(168, 124, 95, 0.08); // accent 极淡
  border: 1rpx dashed rgba(168, 124, 95, 0.35);
  border-radius: 24rpx;
}
.pending-block-title {
  display: block;
  font-size: 22rpx;
  color: $color-accent;
  font-weight: $weight-medium;
  letter-spacing: 1rpx;
  margin-bottom: 16rpx;
}
.pending-card {
  padding: 20rpx 0;
  border-top: 1rpx solid rgba(168, 124, 95, 0.2);

  &:first-of-type { border-top: none; padding-top: 8rpx; }
}
.pending-card-head {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 12rpx;
  margin-bottom: 8rpx;
}
.pending-tag {
  flex-shrink: 0;
  font-size: 20rpx;
  color: $color-accent;
  background-color: rgba(168, 124, 95, 0.16);
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  line-height: 1.4;
  margin-top: 4rpx;
}
.pending-text {
  flex: 1;
  font-size: 28rpx;
  color: $color-text-primary;
  line-height: 1.5;
  font-weight: $weight-medium;
}
.pending-quote {
  display: block;
  font-size: 22rpx;
  color: $color-text-tertiary;
  line-height: 1.5;
  font-style: italic;
  margin-bottom: 16rpx;
}
.pending-actions {
  display: flex;
  flex-direction: row;
  gap: 12rpx;
  justify-content: flex-end;
}
.pending-btn {
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  transition: opacity 0.18s, transform 0.12s;

  &:active { transform: scale(0.95); }
}
.pending-btn-reject {
  background-color: transparent;
  border: 1rpx solid $color-border;
}
.pending-btn-approve {
  background-color: $color-accent;
}
.pending-btn-text-reject {
  font-size: 24rpx;
  color: $color-text-secondary;
}
.pending-btn-text-approve {
  font-size: 24rpx;
  color: $color-background;
  font-weight: $weight-medium;
}

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
// 主动告诉老白(L2 核心入口,视觉权重更高)
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

// === "老白现在看到的"卡(spec-007 信号社交化版,replace dashboard)===
.laoke-verdict-card {
  background-color: $color-surface;
  border-radius: 28rpx;
  padding: 36rpx 40rpx;
  box-shadow: $shadow-sm;
  // 默认 neutral
  border-left: 4rpx solid $color-text-tertiary;

  &.verdict-good { border-left-color: $color-success; }
  &.verdict-neutral { border-left-color: $color-info; }
  &.verdict-warn { border-left-color: $color-warning; }
  &.verdict-danger { border-left-color: $color-danger; }
  &.verdict-inactive { border-left-color: $color-text-tertiary; }
}
.verdict-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}
.verdict-tag {
  font-size: 22rpx;
  color: $color-accent;
  font-weight: $weight-medium;
  letter-spacing: 1rpx;
}
.verdict-sub {
  font-size: 22rpx;
  color: $color-text-tertiary;
}
.verdict-text {
  display: block;
  font-size: 30rpx;
  color: $color-text-primary;
  line-height: 1.65;
  font-weight: $weight-medium;
  letter-spacing: 0.2rpx;
}
.observations {
  margin-top: 28rpx;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding-top: 24rpx;
  border-top: 1rpx dashed $color-border;
}
.obs-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 14rpx;
}
.obs-arrow {
  font-size: 28rpx;
  font-weight: $weight-bold;
  flex-shrink: 0;
  margin-top: 2rpx;
  width: 28rpx;
  text-align: center;
}
.arrow-up { color: $color-success; }
.arrow-down { color: $color-danger; }
.arrow-flat { color: $color-text-tertiary; }
.obs-text {
  font-size: 28rpx;
  color: $color-text-primary;
  line-height: 1.55;
  flex: 1;
}
.interest-quote {
  display: block;
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1rpx dashed $color-border;
  font-size: 28rpx;
  color: $color-accent;
  line-height: 1.6;
  font-style: italic;
  letter-spacing: 0.2rpx;
}

// === "我们" Tab(原 narrative)===
.narrative {
  background-color: $color-surface;
  border-radius: 28rpx;
  border-left: 4rpx solid $color-accent;
  padding: 36rpx 40rpx;
  box-shadow: $shadow-sm;
}
.narrative-regen {
  font-size: 24rpx;
  color: $color-text-secondary;
  font-weight: $weight-medium;
  letter-spacing: 0.2rpx;
  padding: 4rpx 0;
  &:active { opacity: 0.55; }
}
.narrative-empty {
  display: block;
  font-size: 26rpx;
  color: $color-text-tertiary;
  line-height: 1.6;
  font-style: italic;
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

// === 成长 Tab(北极星 + 被见证叙事)===
.north-star {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 8rpx 0 24rpx;
}
.north-star-line {
  font-size: 32rpx;
  color: $color-text-primary;
  font-weight: $weight-medium;
  letter-spacing: 1rpx;
}
.north-star-dot {
  font-size: 28rpx;
  color: $color-text-disabled;
}
// grow-narrative 复用 .narrative,但用 primary-deep 边线区分(跟"我们" accent 边线分开)
.grow-narrative {
  border-left-color: $color-primary-deep;
  margin-top: 16rpx;
}
.grow-tail {
  display: block;
  text-align: center;
  margin-top: 48rpx;
  font-size: 26rpx;
  color: $color-text-tertiary;
  font-style: italic;
  letter-spacing: 0.5rpx;
}

// === 关键时刻 timeline ===
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
// 单行输入(改名用,比 textarea 矮)
.rename-input-line {
  width: 100%;
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  font-size: 30rpx;
  color: $color-text-primary;
  margin-bottom: 24rpx;
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
