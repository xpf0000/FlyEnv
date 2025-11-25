<template>
  <div class="main">
<!--    <img class="screen-image" :src="screenImage" />-->
    <div v-show="rect" class="rect" :style="style"></div>
    <el-button @click.stop="doStop">停止</el-button>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import type { ComputedRef } from 'vue'
  import { CapturerStore } from './store/app'
  import type { Rect } from './store/app'
  import IPC from '@/util/IPC'

  const store = CapturerStore()
  const rect: ComputedRef<Rect | undefined> = computed(() => {
    return store.currentRect
  })
  const screenImage = computed(() => {
    return store.screenImage
  })
  const style = computed(() => {
    return {
      left: `${rect.value?.x}px`,
      top: `${rect.value?.y}px`,
      width: `${rect.value?.width}px`,
      height: `${rect.value?.height}px`
    }
  })
  const doStop = () => {
    IPC.send('Capturer:doStopCapturer').then((key: string) => {
      IPC.off(key)
    })
  }
</script>

<style lang="scss">
  * {
    user-select: none !important;
  }

  html,
  body,
  #app {
    min-height: 100vh;
    min-width: 100vw;
    overflow: hidden;
    background: transparent;
  }

  #app {
    background: rgba(0, 0, 0, 0.2);
    border: 5px solid red;

    .main {
      min-height: 100vh;
      min-width: 100vw;
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;

      .screen-image {
        position: fixed;
        inset: 0;
        z-index: -1;
      }

      .rect {
        position: fixed;
        border: 2px solid #409eff;
        z-index: 50;
      }

      .el-button {
        z-index: 9999;
      }
    }
  }
</style>
