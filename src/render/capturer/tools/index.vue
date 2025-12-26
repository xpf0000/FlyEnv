<template>
  <div
    v-if="RectSelect.selected"
    :style="style"
    :class="{ 'v-reversed': isReversed }"
    class="bg-slate-100 dark:bg-gray-600 rounded-[6px] flex items-center justify-between gap-3 p-[6px] z-[9999] fixed"
  >
    <div class="flex items-center gap-2">
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
      >
        <yb-icon :svg="import('@/svg/fangkuang.svg?raw')" width="16" height="16" />
      </div>
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
      >
        <yb-icon :svg="import('@/svg/yuanxing.svg?raw')" width="16" height="16" />
      </div>
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
      >
        <yb-icon class="p-[1px]" :svg="import('@/svg/jiantou.svg?raw')" width="16" height="16" />
      </div>
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
      >
        <yb-icon class="p-[1px]" :svg="import('@/svg/pen.svg?raw')" width="16" height="16" />
      </div>
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
      >
        <yb-icon :svg="import('@/svg/masaike.svg?raw')" width="16" height="16" />
      </div>
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
      >
        <yb-icon class="p-[2px]" :svg="import('@/svg/text.svg?raw')" width="16" height="16" />
      </div>
    </div>
    <div class="h-[16px] w-[1px] bg-gray-200"></div>
    <div class="flex items-center gap-2">
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
      >
        <yb-icon :svg="import('@/svg/goback.svg?raw')" width="16" height="16" />
      </div>
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
      >
        <yb-icon :svg="import('@/svg/dosave.svg?raw')" width="16" height="16" />
      </div>
    </div>
    <div class="h-[16px] w-[1px] bg-gray-200"></div>
    <div class="flex items-center gap-2">
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
      >
        <Close width="16" height="16" />
      </div>
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
      >
        <Check width="16" height="16" />
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { Close, Check } from '@element-plus/icons-vue'
  import RectSelect from '@/capturer/store/RectSelect'

  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  const vmWidth = 200
  const vmHeight = 90

  const offset = 15

  const vmPosition = computed(() => {
    if (!RectSelect.selected || !RectSelect.editRect) {
      return undefined
    }

    let right = windowWidth - RectSelect.editRect.x + RectSelect.editRect.width
    let top = RectSelect.editRect.y + RectSelect.editRect.height + offset
    if (vmWidth + right > windowWidth) {
      right = offset
    }
    if (top + vmHeight > windowHeight) {
      top = RectSelect.editRect.y - vmHeight - offset
    }

    if (top < 0) {
      top = RectSelect.editRect.y + RectSelect.editRect.height - offset - vmHeight
    }

    return {
      right,
      top
    }
  })

  const style = computed(() => {
    if (!vmPosition.value) {
      return { display: 'none' }
    }
    return {
      right: `${vmPosition.value.right}px`,
      top: `${vmPosition.value.top}px`
    }
  })

  const isReversed = computed(() => {
    if (!vmPosition.value) {
      return false
    }
    if (vmPosition.value.top > RectSelect.editRect!.y + RectSelect.editRect!.height) {
      return false
    }
    return true
  })
</script>
