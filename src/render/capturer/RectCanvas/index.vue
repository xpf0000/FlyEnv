<template>
  <canvas
    ref="canvas"
    class="w-full h-full z-[100]"
    :style="style"
    :width="width"
    :height="height"
    @mousedown.stop="RectCanvasStore.onMouseDown"
    @mousemove="RectCanvasStore.onCanvasMouseMove"
  ></canvas>
</template>
<script lang="ts" setup>
  import { ref, watch, computed } from 'vue'
  import RectCanvasStore from '@/capturer/RectCanvas/RectCanvas'
  import { ScreenStore, CapturerStore } from '@/capturer/store/app'
  import RectSelect from '@/capturer/RectSelector/RectSelect'

  const store = CapturerStore()
  const canvas = ref<HTMLCanvasElement>()

  const width = computed(() => {
    return Math.floor(RectSelect.editRect!.width * store.scaleFactor)
  })
  const height = computed(() => {
    return Math.floor(RectSelect.editRect!.height * store.scaleFactor)
  })

  const style = computed(() => {
    return {
      width: `${RectSelect.editRect!.width}px`,
      height: `${RectSelect.editRect!.height}px`
    }
  })

  watch(
    canvas,
    (newVal) => {
      if (newVal) {
        ScreenStore.rectCanvas = newVal
        ScreenStore.rectCtx = newVal.getContext('2d', { willReadFrequently: true })
      }
    },
    {
      immediate: true
    }
  )
</script>
