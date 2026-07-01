import type { Component } from 'vue'

type AsyncRouteLoader = () => Promise<unknown>

type AsyncComponentWithLoader = Component & {
  __asyncLoader?: AsyncRouteLoader
}

export const normalizeRouteComponent = (component: Component) => {
  return (component as AsyncComponentWithLoader).__asyncLoader ?? component
}
