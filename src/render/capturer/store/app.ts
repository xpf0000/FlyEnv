import { defineStore } from 'pinia'

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

type WindowBoundAndInfo = {
  id: number
  bounds: Rect
  name: string
  image: string
}

export interface State {
  currentRect?: WindowBoundAndInfo
  screenImage?: string
}

const state: State = {
  currentRect: undefined,
  screenImage: undefined
}

export const CapturerStore = defineStore('capturerStore', {
  state: (): State => state,
  getters: {},
  actions: {}
})
