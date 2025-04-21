import { defineStore } from 'pinia'

interface SVG {
  viewBox: string
  raw: string
}

interface State {
  svgs: {
    [k: string]: SVG
  }
}

const state: State = {
  svgs: {}
}

export const SVGStore = defineStore('svgStore', {
  state: (): State => state,
  getters: {},
  actions: {}
})
