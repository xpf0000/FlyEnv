<template>
  <div
    :style="style"
    class="px-2 h-[25px] text-[10px] bg-slate-100 dark:bg-gray-600 rounded-[4px] overflow-hidden flex items-center justify-center gap-1 fixed z-[300]"
  >
    <span>{{ width }}</span>
    <Close class="w-[7px] h-[7px]" />
    <span>{{ height }}</span>
  </div>
</template>
<script setup lang="ts">
  import { computed, onMounted } from 'vue'
  import type { ComputedRef } from 'vue'
  import { CapturerStore } from '@/capturer/store/app'
  import { Close } from '@element-plus/icons-vue'
  import type { Rect } from '@/capturer/store/app'
  import RectSelect from '@/capturer/store/RectSelect'

  const store = CapturerStore()

  const info: ComputedRef<Rect> = computed(() => {
    if (RectSelect.editRect) {
      return RectSelect.editRect
    }
    if (store.currentRect?.bounds) {
      return store.currentRect?.bounds
    }
    return {
      x: 0,
      y: 0,
      width: store.screenRect?.width ?? 0,
      height: store.screenRect?.height ?? 0
    }
  })

  const width = computed(() => {
    return Math.floor(info.value.width * store.scaleFactor)
  })

  const height = computed(() => {
    return Math.floor(info.value.height * store.scaleFactor)
  })

  onMounted(() => {})

  /**
   * 获取放大镜位置
   * 默认在鼠标右下角，需要根据鼠标位置调整避免超出屏幕
   */
  const style = computed(() => {
    const mouseX = info.value.x
    const mouseY = info.value.y
    const offset = 6 // 距离鼠标的偏移量

    // 默认位置：鼠标右下角
    let left = Math.max(6, mouseX)
    let top = mouseY - offset - 25

    // 确保不会超出顶部
    if (top < 0) {
      top = mouseY + offset
      left = mouseX + 6
    }

    return {
      left: `${left}px`,
      top: `${top}px`,
      'pointer-events': 'none' // 防止组件拦截鼠标事件
    }
  })
</script>
