// 全局 dialog 状态 — 用于 AppDialog 组件 + useAppDialog composable

import { defineStore } from 'pinia'
import { ref } from 'vue'

export type DialogMode = 'alert' | 'confirm'

export interface DialogParams {
  title?: string
  body?: string
  mode?: DialogMode
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export const useAppDialogStore = defineStore('app-dialog', () => {
  const open = ref(false)
  const mode = ref<DialogMode>('alert')
  const title = ref('')
  const bodyLines = ref<string[]>([])
  const confirmText = ref('知道了')
  const cancelText = ref('取消')
  const danger = ref(false)

  let resolveFn: ((ok: boolean) => void) | null = null

  function show(params: DialogParams): Promise<boolean> {
    title.value = params.title ?? ''
    bodyLines.value = (params.body ?? '').split('\n')
    mode.value = params.mode ?? 'alert'
    confirmText.value = params.confirmText ?? (params.mode === 'confirm' ? '确定' : '知道了')
    cancelText.value = params.cancelText ?? '取消'
    danger.value = !!params.danger
    open.value = true

    return new Promise<boolean>((resolve) => {
      resolveFn = resolve
    })
  }

  function dismiss(ok: boolean): void {
    open.value = false
    if (resolveFn) {
      resolveFn(ok)
      resolveFn = null
    }
  }

  return {
    open,
    mode,
    title,
    bodyLines,
    confirmText,
    cancelText,
    danger,
    show,
    dismiss,
  }
})
