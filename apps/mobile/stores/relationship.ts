// 关系档案 Pinia store
// 含 dev-mock fallback: 没登录或 API 失败时,展示 mock 数据让 UI 能可视化
// (spec-002 真机微信登录联通后移除 mock)

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  Relationship,
  CreateRelationshipInput,
  UpdateRelationshipInput,
} from '../types/relationship'
import {
  listRelationshipsApi,
  getRelationshipApi,
  createRelationshipApi,
  updateRelationshipApi,
  deleteRelationshipApi,
  archiveRelationshipApi,
  restoreRelationshipApi,
  addReminderApi,
} from '../api/relationship.api'

// === dev-mock 数据(只在 API 失败时展示) ===
const MOCK_RELATIONSHIPS: Relationship[] = [
  {
    id: 'mock-1',
    user_id: 'mock-user',
    name: '小雨',
    avatar_seed: 'syu',
    avatar_url: null,
    stage: 'FLIRTING',
    basic_facts: {
      how_we_met: '朋友介绍,3 月在咖啡馆',
      key_facts: ['设计专业', '喜欢爵士乐', '下班后逛书店'],
    },
    user_reminders: ['她最近在写论文,压力大', '她对"可爱"这种夸她外表的词比较敏感'],
    archived: false,
    created_at: new Date(Date.now() - 30 * 86400_000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
    deleted_at: null,
  },
  {
    id: 'mock-2',
    user_id: 'mock-user',
    name: '小美',
    avatar_seed: 'smei',
    avatar_url: null,
    stage: 'INIT',
    basic_facts: { how_we_met: '同事饭局' },
    user_reminders: [],
    archived: false,
    created_at: new Date(Date.now() - 14 * 86400_000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 86400_000).toISOString(),
    deleted_at: null,
  },
  {
    id: 'mock-3',
    user_id: 'mock-user',
    name: '玲玲',
    avatar_seed: 'sling',
    avatar_url: null,
    stage: 'COMMITTED',
    basic_facts: { key_facts: ['一起两年了', '喜欢爬山'] },
    user_reminders: [],
    archived: false,
    created_at: new Date(Date.now() - 700 * 86400_000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
    deleted_at: null,
  },
]

export type ListState = 'loading' | 'ready' | 'empty' | 'error'

export const useRelationshipStore = defineStore('relationship', () => {
  const items = ref<Relationship[]>([])
  const archivedItems = ref<Relationship[]>([])
  const listState = ref<ListState>('loading')
  const errorMessage = ref('')
  const usingMock = ref(false)

  /** 从 store cache 拿,找不到则远程拉 */
  function findById(id: string): Relationship | undefined {
    return items.value.find((r) => r.id === id) ?? archivedItems.value.find((r) => r.id === id)
  }

  async function fetchList(): Promise<void> {
    listState.value = 'loading'
    errorMessage.value = ''

    const res = await listRelationshipsApi({ archived: false })

    if (res.ok) {
      items.value = res.data.items
      usingMock.value = false
      listState.value = items.value.length === 0 ? 'empty' : 'ready'
      // 同时拉归档(独立失败不影响主列表)
      const archivedRes = await listRelationshipsApi({ archived: true })
      if (archivedRes.ok) archivedItems.value = archivedRes.data.items
      return
    }

    // 失败 fallback:dev 态展示 mock,生产态显示错误
    if (res.error.code === 'AUTH_REQUIRED' || res.error.code === 'AUTH_FAILED' || res.error.code === 'NETWORK_ERROR') {
      // 没登录 / 网络问题 → mock 演示视觉
      items.value = MOCK_RELATIONSHIPS
      archivedItems.value = []
      usingMock.value = true
      listState.value = 'ready'
      return
    }

    errorMessage.value = res.error.message
    listState.value = 'error'
  }

  async function fetchOne(id: string): Promise<Relationship | null> {
    const cached = findById(id)
    if (cached) return cached
    const res = await getRelationshipApi(id)
    if (res.ok) return res.data
    // mock fallback for preview
    return MOCK_RELATIONSHIPS.find((r) => r.id === id) ?? null
  }

  async function create(input: CreateRelationshipInput): Promise<Relationship | null> {
    const res = await createRelationshipApi(input)
    if (res.ok) {
      items.value = [res.data, ...items.value]
      return res.data
    }
    if (usingMock.value) {
      // mock 模式下假装创建成功
      const fake: Relationship = {
        id: `mock-new-${Date.now()}`,
        user_id: 'mock-user',
        name: input.name,
        avatar_seed: 'snew',
        avatar_url: null,
        stage: input.stage,
        basic_facts: input.basic_facts ?? {},
        user_reminders: input.user_reminders ?? [],
        archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      }
      items.value = [fake, ...items.value]
      return fake
    }
    uni.showToast({ title: res.error.message, icon: 'none' })
    return null
  }

  async function update(id: string, input: UpdateRelationshipInput): Promise<void> {
    const res = await updateRelationshipApi(id, input)
    if (res.ok) {
      const idx = items.value.findIndex((r) => r.id === id)
      if (idx >= 0) items.value[idx] = res.data
      return
    }
    if (usingMock.value) {
      // mock 直接改本地
      const idx = items.value.findIndex((r) => r.id === id)
      if (idx >= 0 && items.value[idx]) {
        items.value[idx] = { ...items.value[idx]!, ...input, updated_at: new Date().toISOString() }
      }
      return
    }
    uni.showToast({ title: res.error.message, icon: 'none' })
  }

  async function softDelete(id: string): Promise<boolean> {
    const res = await deleteRelationshipApi(id)
    if (res.ok || usingMock.value) {
      items.value = items.value.filter((r) => r.id !== id)
      archivedItems.value = archivedItems.value.filter((r) => r.id !== id)
      return true
    }
    uni.showToast({ title: res.error.message, icon: 'none' })
    return false
  }

  async function archive(id: string): Promise<void> {
    const res = await archiveRelationshipApi(id)
    if (res.ok || usingMock.value) {
      const target = items.value.find((r) => r.id === id)
      items.value = items.value.filter((r) => r.id !== id)
      if (target) archivedItems.value = [{ ...target, archived: true }, ...archivedItems.value]
      return
    }
    uni.showToast({ title: res.error.message, icon: 'none' })
  }

  async function restore(id: string): Promise<void> {
    const res = await restoreRelationshipApi(id)
    if (res.ok || usingMock.value) {
      const target = archivedItems.value.find((r) => r.id === id)
      archivedItems.value = archivedItems.value.filter((r) => r.id !== id)
      if (target) items.value = [{ ...target, archived: false }, ...items.value]
      return
    }
    uni.showToast({ title: res.error.message, icon: 'none' })
  }

  /** 用 server 返回的最新值覆盖本地 cache。给 extract-profile 这种"server 已改"流程用,避免重复 PATCH */
  function replaceLocalCopy(updated: Relationship): void {
    const idx = items.value.findIndex((r) => r.id === updated.id)
    if (idx >= 0) {
      items.value[idx] = updated
    } else {
      items.value = [updated, ...items.value]
    }
  }

  async function addReminder(id: string, content: string): Promise<void> {
    const res = await addReminderApi(id, content)
    if (res.ok) {
      const idx = items.value.findIndex((r) => r.id === id)
      if (idx >= 0) items.value[idx] = res.data
      return
    }
    if (usingMock.value) {
      const idx = items.value.findIndex((r) => r.id === id)
      if (idx >= 0 && items.value[idx]) {
        items.value[idx] = {
          ...items.value[idx]!,
          user_reminders: [...items.value[idx]!.user_reminders, content],
        }
      }
      return
    }
    uni.showToast({ title: res.error.message, icon: 'none' })
  }

  return {
    items,
    archivedItems,
    listState,
    errorMessage,
    usingMock,
    findById,
    fetchList,
    fetchOne,
    create,
    update,
    replaceLocalCopy,
    softDelete,
    archive,
    restore,
    addReminder,
  }
})
