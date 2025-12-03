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
  screenRect: Rect | undefined
  currentRect?: WindowBoundAndInfo
  screenImage?: string
  windowImages: Record<number, string>
}

const state: State = {
  screenRect: undefined,
  currentRect: undefined,
  screenImage: undefined,
  windowImages: {}
}

export const CapturerStore = defineStore('capturerStore', {
  state: (): State => state,
  getters: {},
  actions: {}
})
