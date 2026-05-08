// 关系档案 Pinia store
//
// 2026-05-08 cleanup:删除 MOCK_RELATIONSHIPS + usingMock 死代码。
// 之前 fallback 到 mock 是 dev 阶段过渡设计,但 spec-010 已上线就绪,匿名账号
// ensureSession() 在 App.vue mount 时跑,真用户路径 store.token 始终有值。
// 删除 mock 也根除"dev seed 漏给真用户"的同类风险。

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

export type ListState = 'loading' | 'ready' | 'empty' | 'error'

export const useRelationshipStore = defineStore('relationship', () => {
  const items = ref<Relationship[]>([])
  const archivedItems = ref<Relationship[]>([])
  const listState = ref<ListState>('loading')
  const errorMessage = ref('')

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
      listState.value = items.value.length === 0 ? 'empty' : 'ready'
      // 同时拉归档(独立失败不影响主列表)
      const archivedRes = await listRelationshipsApi({ archived: true })
      if (archivedRes.ok) archivedItems.value = archivedRes.data.items
      return
    }

    errorMessage.value = res.error.message
    listState.value = 'error'
  }

  async function fetchOne(id: string): Promise<Relationship | null> {
    const cached = findById(id)
    if (cached) return cached
    const res = await getRelationshipApi(id)
    return res.ok ? res.data : null
  }

  async function create(input: CreateRelationshipInput): Promise<Relationship | null> {
    const res = await createRelationshipApi(input)
    if (res.ok) {
      items.value = [res.data, ...items.value]
      return res.data
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
    uni.showToast({ title: res.error.message, icon: 'none' })
  }

  async function softDelete(id: string): Promise<boolean> {
    const res = await deleteRelationshipApi(id)
    if (res.ok) {
      items.value = items.value.filter((r) => r.id !== id)
      archivedItems.value = archivedItems.value.filter((r) => r.id !== id)
      return true
    }
    uni.showToast({ title: res.error.message, icon: 'none' })
    return false
  }

  async function archive(id: string): Promise<void> {
    const res = await archiveRelationshipApi(id)
    if (res.ok) {
      const target = items.value.find((r) => r.id === id)
      items.value = items.value.filter((r) => r.id !== id)
      if (target) archivedItems.value = [{ ...target, archived: true }, ...archivedItems.value]
      return
    }
    uni.showToast({ title: res.error.message, icon: 'none' })
  }

  async function restore(id: string): Promise<void> {
    const res = await restoreRelationshipApi(id)
    if (res.ok) {
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
    uni.showToast({ title: res.error.message, icon: 'none' })
  }

  return {
    items,
    archivedItems,
    listState,
    errorMessage,
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
