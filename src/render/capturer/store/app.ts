import { defineStore } from 'pinia'

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export interface TrayState {
  currentRect?: Rect
  screenImage?: string
}

const state: TrayState = {
  currentRect: undefined,
  screenImage: undefined
}

export const CapturerStore = defineStore('capturerStore', {
  state: (): TrayState => state,
  getters: {},
  actions: {}
})
