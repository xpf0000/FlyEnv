<template>
  <div
    v-if="info.show"
    ref="wapperRef"
    :style="style"
    class="p-[6px] bg-slate-100 dark:bg-gray-600 rounded-[6px] overflow-hidden flex flex-col gap-1 fixed z-[300]"
  >
    <img class="w-[120px] h-[80px] rounded-[6px] overflow-hidden" :src="info.image" />
    <div class="flex items-center justify-between text-[11px]">
      <span>坐标</span>
      <span>{{ Math.round(info.point.showX) }}, {{ Math.round(info.point.showY) }}</span>
    </div>
    <div class="flex items-center justify-between text-[11px]">
      <span>HEX</span>
      <span>{{ info.hex }}</span>
    </div>
    <div class="flex items-center justify-between text-[11px]">
      <span>RGB</span>
      <span>{{ info.rgb }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref, watch, nextTick, onMounted } from 'vue'
  import { CapturerStore } from '@/capturer/store/app'

  const wapperRef = ref<HTMLDivElement | undefined>(undefined)
  const store = CapturerStore()
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  const info = computed(() => {
    return store.magnifyingInfo
  })

  watch(
    () => info.value.show,
    (v) => {
      if (v) {
        if (info.value.componentWidth) {
          return
        }
        nextTick(() => {
          if (wapperRef.value) {
            const rect = wapperRef.value.getBoundingClientRect()
            info.value.componentWidth = rect.width
            info.value.componentHeight = rect.height
          }
        })
      }
    }
  )

  onMounted(() => {
    if (info.value.componentWidth) {
      return
    }
    nextTick(() => {
      if (wapperRef.value) {
        const rect = wapperRef.value.getBoundingClientRect()
        info.value.componentWidth = rect.width
        info.value.componentHeight = rect.height
      }
    })
  })

  /**
   * 获取放大镜位置
   * 默认在鼠标右下角，需要根据鼠标位置调整避免超出屏幕
   */
  const style = computed(() => {
    if (!info.value || !info.value.show) {
      return { display: 'none' }
    }

    const mouseX = info.value.point.x
    const mouseY = info.value.point.y
    const offset = 20 // 距离鼠标的偏移量

    // 默认位置：鼠标右下角
    let left = mouseX + offset
    let top = mouseY + offset

    // 检查右侧是否超出屏幕
    if (left + info.value.componentWidth > windowWidth) {
      // 超出右侧，显示在鼠标左侧
      left = mouseX - offset - info.value.componentWidth
    }

    // 检查底部是否超出屏幕
    if (top + info.value.componentHeight > windowHeight) {
      // 超出底部，显示在鼠标上方
      top = mouseY - offset - info.value.componentHeight
    }

    // 确保不会超出左侧
    if (left < 0) {
      left = offset
    }

    // 确保不会超出顶部
    if (top < 0) {
      top = offset
    }

    return {
      left: `${left}px`,
      top: `${top}px`,
      'pointer-events': 'none' // 防止组件拦截鼠标事件
    }
  })
</script>
