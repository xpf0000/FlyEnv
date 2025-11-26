<template>
  <div class="main h-full w-full flex items-center justify-center relative">
    <img class="screen-image" :src="screenImage" />
    <div v-show="rect" class="rect" :style="style" @click.stop="onRectClick"></div>
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
    return store?.currentRect?.bounds
  })
  const screenImage = computed(() => {
    return store.screenImage
  })
  const style = computed(() => {
    if (!rect.value?.width) {
      return {
        left: '-1px',
        top: '-1px',
        width: '1px',
        height: '1px'
      }
    }
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
  const onRectClick = () => {
    console.log('onRectClick !!!')
  }
</script>

<style lang="scss">
  * {
    user-select: none !important;
  }

  html,
  body,
  #app {
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: transparent;
  }

  #app {
    border: 5px solid red;

    .main {
      .screen-image {
        position: fixed;
        inset: 0;
        z-index: -1;
      }

      .rect {
        position: fixed;
        border: 2px solid #409eff;
        z-index: 50;
        background: transparent;
        /* 使用超大box-shadow创建遮罩效果 */
        box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.4);
        //pointer-events: none;
      }

      .el-button {
        z-index: 9999;
      }
    }
  }
</style>
