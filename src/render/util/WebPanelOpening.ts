import { ref, type Ref } from 'vue'

type WebPanelOpening = {
  opening: Ref<boolean>
  start: () => boolean
  finish: () => void
}

const states = new Map<string, WebPanelOpening>()

export const webPanelOpeningState = (panel: string): WebPanelOpening => {
  const existing = states.get(panel)
  if (existing) return existing

  const opening = ref(false)
  const state: WebPanelOpening = {
    opening,
    start: () => {
      if (opening.value) return false
      opening.value = true
      return true
    },
    finish: () => {
      opening.value = false
    }
  }
  states.set(panel, state)
  return state
}
