<template>
  <div class="main h-full w-full flex items-center justify-center relative">
    <img
      ref="screenImgRef"
      :style="screenImageStyle"
      style="image-rendering: high-quality"
      class="screen-image"
      :src="screenImage"
      crossorigin="anonymous"
      decoding="sync"
    />
    <div
      v-show="rect"
      :class="{ 'no-border': store.rectSelected }"
      class="rect"
      :style="style"
      @click.stop="onRectClick"
    >
      <img
        v-show="rectImage"
        ref="rectImgRef"
        decoding="sync"
        crossorigin="anonymous"
        :src="rectImage"
      />
    </div>
    <RectSelector></RectSelector>
    <Magnifying />
    <el-button @click.stop="doStop">停止</el-button>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, watch, ref } from 'vue'
  import type { ComputedRef } from 'vue'
  import { CapturerStore } from './store/app'
  import type { Rect } from './store/app'
  import IPC from '@/util/IPC'
  import RectSelector from './selector.vue'
  import Magnifying from './magnifying.vue'

  const screenImgRef = ref<HTMLImageElement | undefined>(undefined)
  const rectImgRef = ref<HTMLImageElement | undefined>(undefined)

  const store = CapturerStore()
  const currentRect = computed(() => {
    return store?.currentRect
  })
  const rectImage = computed(() => {
    return store.windowImages?.[currentRect?.value?.id ?? 0]
  })
  const rect: ComputedRef<Rect | undefined> = computed(() => {
    return store?.currentRect?.bounds
  })
  const screenImage = computed(() => {
    return store.screenImage
  })
  const screenImageStyle = computed(() => {
    if (!store.screenRect) {
      return {}
    }
    const physicalWidth = store.screenRect.width
    const physicalHeight = store.screenRect.height
    // 2. 获取当前浏览器的 DPI 缩放比例
    const scaleFactor = window.devicePixelRatio // 例如 1.5
    // 3. 计算用于 CSS 的逻辑像素尺寸
    const logicalWidth = physicalWidth / scaleFactor
    const logicalHeight = physicalHeight / scaleFactor

    console.log('screenImageStyle: ', physicalWidth, physicalHeight, logicalWidth, logicalHeight)
    return {
      width: `${logicalWidth}px`,
      height: `${logicalHeight}px`
    }
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

  watch(
    screenImage,
    (v) => {
      if (v) {
        if (screenImgRef.value) {
          store.getCanvas(v, rectImage.value, store.currentRect?.bounds).catch()
        }
      }
    },
    {
      immediate: true
    }
  )

  window.addEventListener('mousemove', store.onWindowMouseMove)

  onBeforeUnmount(() => {
    window.removeEventListener('mousemove', store.onWindowMouseMove)
  })

  const doStop = () => {
    IPC.send('Capturer:doStopCapturer').then((key: string) => {
      IPC.off(key)
    })
  }
  const onRectClick = () => {
    IPC.send('Capturer:stopCheckWindowInPoint').then((key: string) => {
      IPC.off(key)
    })
    console.log('onRectClick !!!')
    const rect = document.body.getBoundingClientRect()
    console.log('body rect: ', rect)
    if (currentRect.value?.id && !store.windowImages?.[currentRect.value?.id]) {
      IPC.send('Capturer:getWindowCapturer', currentRect.value?.id).then((key: string) => {
        IPC.off(key)
      })
    }
    store.magnifyingInfo.show = false
    store.editRect = {
      ...store.currentRect?.bounds
    } as any
    store.rectSelected = true
  }
</script>

<style lang="scss">
  * {
    user-select: none !important;
  }

  html,
  body,
  #app {
    height: 100%;
    width: 100%;
    min-height: 100vh;
    min-width: 100vw;
    overflow: hidden;
    background: transparent;
    padding: 0;
  }

  #app {
    position: relative;
    &:after {
      content: '';
      position: absolute;
      inset: 0;
      border: 5px solid red;
      z-index: -1;
    }

    .main {
      .screen-image {
        position: fixed;
        inset: 0;
        z-index: -1;
      }

      .rect {
        position: fixed;
        z-index: 50;
        background: transparent;
        /* 使用超大box-shadow创建遮罩效果 */
        box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.4);
        //pointer-events: none;

        &:after {
          content: '';
          position: absolute;
          inset: 0;
          border: 2px solid #409eff;
          z-index: 100;
        }

        > img {
          width: 100%;
          height: 100%;
          z-index: -1;
          image-rendering: high-quality;
        }

        &.no-border {
          box-shadow: none;

          &:after {
            display: none;
          }
        }
      }

      .el-button {
        z-index: 9999;
      }
    }
  }
</style>
