// useAppDialog — 全局产品级 dialog,替代 window.alert / uni.showModal
//
// 用法:
//   import { useAppDialog } from '@/composables/useAppDialog'
//   const dialog = useAppDialog()
//   await dialog.alert('已注入演示信号', { body: '看下面 Briefing 卡是否变化' })
//   const ok = await dialog.confirm('删掉这条?', { confirmText: '删掉', danger: true })

import { useAppDialogStore, type DialogParams } from '../stores/app-dialog'

export function useAppDialog() {
  const store = useAppDialogStore()

  function alert(title: string, opts: Omit<DialogParams, 'title' | 'mode'> = {}) {
    return store.show({ ...opts, title, mode: 'alert' })
  }

  function confirm(title: string, opts: Omit<DialogParams, 'title' | 'mode'> = {}) {
    return store.show({ ...opts, title, mode: 'confirm' })
  }

  return { alert, confirm }
}
