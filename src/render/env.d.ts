/// <reference types="vite/client" />

declare module '*.vue' {
  import { DefineComponent } from 'vue'
  // @ts-ignore
  const component: DefineComponent<object, object, any>
  export default component
}
