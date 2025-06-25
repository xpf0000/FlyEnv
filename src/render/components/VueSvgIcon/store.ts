import { reactive } from 'vue'

interface SVG {
  viewBox: string
  raw: string
}

interface State {
  svgs: {
    [k: string]: SVG
  }
}

const state: State = reactive({
  svgs: {}
})

export const SVGStore = () => {
  return state
}
