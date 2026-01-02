<template>
  <div
    v-if="CapurerTool.style"
    :style="CapurerTool.style"
    class="bg-slate-100 dark:bg-gray-600 rounded-[6px] flex items-center justify-between gap-3 p-[6px] z-[9999] fixed"
  >
    <div class="flex items-center gap-2">
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        :class="{
          [`bg-blue-100`]: CapurerTool.tool === 'square'
        }"
        @click.stop="CapurerTool.updateTool('square')"
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
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        :class="{
          [`bg-blue-100`]: CapurerTool.tool === 'circle'
        }"
        @click.stop="CapurerTool.updateTool('circle')"
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
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        :class="{
          [`bg-blue-100`]: CapurerTool.tool === 'arrow'
        }"
        @click.stop="CapurerTool.updateTool('arrow')"
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
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        :class="{
          [`bg-blue-100`]: CapurerTool.tool === 'draw'
        }"
        @click.stop="CapurerTool.updateTool('draw')"
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
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        :class="{
          [`bg-blue-100`]: CapurerTool.tool === 'mask'
        }"
        @click.stop="CapurerTool.updateTool('mask')"
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
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        :class="{
          [`bg-blue-100`]: CapurerTool.tool === 'text'
        }"
        @click.stop="CapurerTool.updateTool('text')"
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
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        :class="{
          [`bg-blue-100`]: CapurerTool.tool === 'tag'
        }"
        @click.stop="CapurerTool.updateTool('tag')"
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
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
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
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
      >
        <yb-icon :svg="import('@/svg/dosave.svg?raw')" width="16" height="16" />
      </div>
    </div>
    <div class="h-[16px] w-[1px] bg-gray-200"></div>
    <div class="flex items-center gap-2">
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        @click.stop="exitCapturer"
      >
        <Close width="16" height="16" />
      </div>
      <div
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
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
  import { computed } from 'vue'
  import { Close, Check } from '@element-plus/icons-vue'
  import ColorAndWidth from '@/capturer/tools/colorAndWidth.vue'
  import MaskVM from '@/capturer/tools/Mask.vue'
  import TextVM from '@/capturer/tools/Text.vue'
  import CapurerTool from './tools'
  import RectCanvasStore from '@/capturer/RectCanvas/RectCanvas'
  import IPC from '@/util/IPC'

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
    IPC.send('Capturer:doStopCapturer').then((key: string) => {
      IPC.off(key)
    })
  }
</script>
