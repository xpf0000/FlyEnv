<template>
  <div
    v-if="CapurerTool.style"
    ref="tool"
    :style="CapurerTool.style"
    class="bg-slate-100 dark:bg-gray-800 rounded-[6px] flex items-center justify-between gap-3 p-[6px] z-[9999] fixed"
  >
    <div class="flex items-center gap-2">
      <div
        class="w-[24px] tool-item h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        :class="{
          active: CapurerTool.tool === 'square',
          [`bg-[#409EFF33]`]: CapurerTool.tool === 'square'
        }"
        @click.stop="updateTool('square')"
      >
        <yb-icon
          :class="{
            [`text-[#409EFF]`]: CapurerTool.tool === 'square'
          }"
          :svg="import('@/svg/fangkuang.svg?raw')"
          width="16"
          height="16"
        />
      </div>
      <div
        class="w-[24px] tool-item h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        :class="{
          active: CapurerTool.tool === 'circle',
          [`bg-[#409EFF33]`]: CapurerTool.tool === 'circle'
        }"
        @click.stop="updateTool('circle')"
      >
        <yb-icon
          :class="{
            [`text-[#409EFF]`]: CapurerTool.tool === 'circle'
          }"
          :svg="import('@/svg/yuanxing.svg?raw')"
          width="16"
          height="16"
        />
      </div>
      <div
        class="w-[24px] tool-item h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        :class="{
          active: CapurerTool.tool === 'arrow',
          [`bg-[#409EFF33]`]: CapurerTool.tool === 'arrow'
        }"
        @click.stop="updateTool('arrow')"
      >
        <yb-icon
          :class="{
            [`text-[#409EFF]`]: CapurerTool.tool === 'arrow'
          }"
          class="p-[1px]"
          :svg="import('@/svg/jiantou.svg?raw')"
          width="16"
          height="16"
        />
      </div>
      <div
        class="w-[24px] tool-item h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        :class="{
          active: CapurerTool.tool === 'draw',
          [`bg-[#409EFF33]`]: CapurerTool.tool === 'draw'
        }"
        @click.stop="updateTool('draw')"
      >
        <yb-icon
          :class="{
            [`text-[#409EFF]`]: CapurerTool.tool === 'draw'
          }"
          class="p-[1px]"
          :svg="import('@/svg/pen.svg?raw')"
          width="16"
          height="16"
        />
      </div>
      <div
        class="w-[24px] tool-item h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        :class="{
          active: CapurerTool.tool === 'mask',
          [`bg-[#409EFF33]`]: CapurerTool.tool === 'mask'
        }"
        @click.stop="updateTool('mask')"
      >
        <yb-icon
          :class="{
            [`text-[#409EFF]`]: CapurerTool.tool === 'mask'
          }"
          :svg="import('@/svg/masaike.svg?raw')"
          width="16"
          height="16"
        />
      </div>
      <div
        class="w-[24px] tool-item h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        :class="{
          active: CapurerTool.tool === 'text',
          [`bg-[#409EFF33]`]: CapurerTool.tool === 'text'
        }"
        @click.stop="updateTool('text')"
      >
        <yb-icon
          :class="{
            [`text-[#409EFF]`]: CapurerTool.tool === 'text'
          }"
          class="p-[2px]"
          :svg="import('@/svg/text.svg?raw')"
          width="16"
          height="16"
        />
      </div>
      <div
        class="w-[24px] tool-item h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        :class="{
          active: CapurerTool.tool === 'tag',
          [`bg-[#409EFF33]`]: CapurerTool.tool === 'tag'
        }"
        @click.stop="updateTool('tag')"
      >
        <yb-icon
          :class="{
            [`text-[#409EFF]`]: CapurerTool.tool === 'tag'
          }"
          class=""
          :svg="import('@/svg/tag.svg?raw')"
          width="16"
          height="16"
        />
      </div>
    </div>
    <div class="h-[16px] w-[1px] bg-gray-200"></div>
    <div class="flex items-center gap-2">
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        @click.stop="goBack"
      >
        <yb-icon
          :class="{
            'opacity-35': !canGoBack
          }"
          :svg="import('@/svg/goback.svg?raw')"
          width="16"
          height="16"
        />
      </div>
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        @click.stop="store.saveImage(false)"
      >
        <yb-icon :svg="import('@/svg/dosave.svg?raw')" width="16" height="16" />
      </div>
    </div>
    <div class="h-[16px] w-[1px] bg-gray-200"></div>
    <div class="flex items-center gap-2">
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        @click.stop="exitCapturer"
      >
        <Close width="16" height="16" />
      </div>
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        @click.stop="store.saveImage(true)"
      >
        <Check width="16" height="16" />
      </div>
    </div>
    <ColorAndWidth v-if="['square', 'circle', 'arrow', 'draw'].includes(CapurerTool.tool)" />
    <TextVM v-else-if="CapurerTool.tool === 'text' || CapurerTool.tool === 'tag'" />
    <MaskVM v-else-if="CapurerTool.tool === 'mask'" />
  </div>
</template>
<script lang="ts" setup>
  import { computed, nextTick, ref, watch } from 'vue'
  import { Check, Close } from '@element-plus/icons-vue'
  import ColorAndWidth from '@/capturer/tools/colorAndWidth.vue'
  import MaskVM from '@/capturer/tools/Mask.vue'
  import TextVM from '@/capturer/tools/Text.vue'
  import CapurerTool from './tools'
  import RectCanvasStore from '@/capturer/RectCanvas/RectCanvas'
  import { CapturerStore } from '@/capturer/store/app'

  const store = CapturerStore()

  const tool = ref<HTMLElement>()

  watch(tool, (v) => {
    if (v) {
      const rect = v.getBoundingClientRect()
      console.log('tool rect: ', rect)
    }
  })

  const updateTool = (t: any) => {
    CapurerTool.updateTool(t)
    nextTick(() => {
      const item = tool.value?.querySelector('.tool-item.active')
      if (item) {
        const itemRect = item.getBoundingClientRect()
        CapurerTool.toolArrowCenter = itemRect.left + itemRect.width / 2
        console.log('updateTool: ', item, itemRect, CapurerTool.toolArrowCenter)
      }
    })
  }

  const canGoBack = computed(() => {
    return RectCanvasStore.history.length > 0
  })

  const goBack = () => {
    if (!canGoBack.value) {
      return
    }
    RectCanvasStore.historyDoBack()
  }

  const exitCapturer = () => {
    store.exitCapturer().catch()
  }
</script>
