import type { CallbackFn } from '@shared/app'

export const createVersionDeleteLifecycle = (onDone?: CallbackFn) => {
  let deleting = false
  let finished = false

  const finish = () => {
    if (finished) {
      return
    }
    finished = true
    onDone?.()
  }

  return {
    markDeleting() {
      deleting = true
    },
    handleClosed() {
      if (!deleting) {
        finish()
      }
    },
    handleDeleteFinished() {
      finish()
    }
  }
}
