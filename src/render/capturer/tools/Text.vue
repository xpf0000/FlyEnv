<template>
  <div
    :class="{ 'v-reversed': CapurerTool.isReversed }"
    class="capturer-tools-text bg-slate-100 dark:bg-gray-800 rounded-[6px] flex items-center justify-between gap-3 p-[6px] z-[9999] absolute"
  >
    <div
      ref="arrow"
      class="z-[-1] opacity-0 arrow bg-slate-100 dark:bg-gray-800 rounded-[2px] w-[10px] h-[10px] absolute"
    ></div>
    <div
      :style="arrowStyle"
      class="z-[-1] arrow bg-slate-100 dark:bg-gray-800 rounded-[2px] w-[10px] h-[10px] absolute"
    ></div>
    <div class="flex items-center gap-2">
      <div
        :class="{
          [`bg-[#409EFF33]`]: currentFontSize === 15
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        @click.stop="currentFontSize = 15"
      >
        <yb-icon
          :class="{
            [`text-[#409EFF]`]: currentFontSize === 15
          }"
          class="p-[1px]"
          :svg="import('@/svg/a.svg?raw')"
          width="12"
          height="12"
        />
      </div>
      <div
        :class="{
          [`bg-[#409EFF33]`]: currentFontSize === 20
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        @click.stop="currentFontSize = 20"
      >
        <yb-icon
          :class="{
            [`text-[#409EFF]`]: currentFontSize === 20
          }"
          class="p-[1px]"
          :svg="import('@/svg/a.svg?raw')"
          width="16"
          height="16"
        />
      </div>
      <div
        :class="{
          [`bg-[#409EFF33]`]: currentFontSize === 25
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
        @click.stop="currentFontSize = 25"
      >
        <yb-icon
          :class="{
            [`text-[#409EFF]`]: currentFontSize === 25
          }"
          class="p-[1px]"
          :svg="import('@/svg/a.svg?raw')"
          width="20"
          height="20"
        />
      </div>
    </div>
    <div class="h-[16px] w-[1px] bg-gray-200"></div>
    <div class="flex items-center gap-2">
      <div
        :class="{
          [`bg-[#fcd3d3]`]: currentColor === '#F56C6C'
        }"
        class="hover:bg-[#FCD3D3] w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center"
        @click.stop="currentColor = '#F56C6C'"
      >
        <div class="w-[14px] h-[14px] rounded-[3px] bg-[#F56C6C]"></div>
      </div>
      <div
        :class="{
          [`bg-[#f8e3c5]`]: currentColor === '#E6A23C'
        }"
        class="hover:bg-[#F8E3C5] w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center"
        @click.stop="currentColor = '#E6A23C'"
      >
        <div class="w-[14px] h-[14px] rounded-[3px] bg-[#E6A23C]"></div>
      </div>
      <div
        :class="{
          [`bg-[#d1edc4]`]: currentColor === '#67C23A'
        }"
        class="hover:bg-[#D1EDC4] w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center"
        @click.stop="currentColor = '#67C23A'"
      >
        <div class="w-[14px] h-[14px] rounded-[3px] bg-[#67C23A]"></div>
      </div>
      <div
        :class="{
          [`bg-[#c6e2ff]`]: currentColor === '#409EFF'
        }"
        class="hover:bg-[#C6E2FF] w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center"
        @click.stop="currentColor = '#409EFF'"
      >
        <div class="w-[14px] h-[14px] rounded-[3px] bg-[#409EFF]"></div>
      </div>
      <div
        :class="{
          [`bg-[#dedfe0]`]: currentColor === '#909399'
        }"
        class="hover:bg-[#DEDFE0] w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center"
        @click.stop="currentColor = '#909399'"
      >
        <div class="w-[14px] h-[14px] rounded-[3px] bg-[#909399]"></div>
      </div>
      <div
        :class="{
          [`bg-[#dedfe0]`]: currentColor === '#FFFFFF'
        }"
        class="hover:bg-[#DEDFE0] w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center"
        @click.stop="currentColor = '#FFFFFF'"
      >
        <div class="w-[14px] h-[14px] rounded-[3px] bg-[#FFFFFF]"></div>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import CapurerTool from './tools'
  import RectCanvasStore from '@/capturer/RectCanvas/RectCanvas'
  import type { Text } from '@/capturer/shape/Text'
  import type { Tag } from '@/capturer/shape/Tag'

  const arrow = ref()

  const arrowStyle = computed(() => {
    if (!arrow.value) {
      return null
    }
    const rect = arrow.value.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const offsetX = CapurerTool.toolArrowCenter - centerX
    console.log('arrowStyle: ', rect, centerX, offsetX)
    return {
      transform: `translateX(${offsetX}px) rotate(-45deg)`
    }
  })

  const currentColor = computed({
    get() {
      const tool: 'text' | 'tag' = CapurerTool.tool as any
      return CapurerTool[tool].color
    },
    set(v) {
      const tool: 'text' | 'tag' = CapurerTool.tool as any
      CapurerTool[tool].color = v
      if (RectCanvasStore.edit?.type === tool && RectCanvasStore.edit!.strokeColor !== v) {
        const start = RectCanvasStore.editStringify(RectCanvasStore.edit)
        const shape: Text | Tag = RectCanvasStore.edit as any
        shape.strokeColor = v
        shape.onStrokeColorChanged()
        shape.reDraw()
        shape.draw()
        if (!shape.textEditing) {
          const end = RectCanvasStore.editStringify(RectCanvasStore.edit)
          RectCanvasStore.history.push({
            action: 'change',
            start,
            end
          })
        }
      }
    }
  })

  const currentFontSize = computed({
    get() {
      const tool: 'text' | 'tag' = CapurerTool.tool as any
      return CapurerTool[tool].fontSize
    },
    set(v) {
      const tool: 'text' | 'tag' = CapurerTool.tool as any
      CapurerTool[tool].fontSize = v
      if (RectCanvasStore.edit?.type === tool && RectCanvasStore.edit!.toolWidth !== v) {
        const start = RectCanvasStore.editStringify(RectCanvasStore.edit)
        const shape: Text | Tag = RectCanvasStore.edit as any
        shape.toolWidth = v
        shape.onToolWidthChanged()
        shape.reDraw()
        shape.draw()
        if (!shape.textEditing) {
          const end = RectCanvasStore.editStringify(RectCanvasStore.edit)
          RectCanvasStore.history.push({
            action: 'change',
            start,
            end
          })
        }
      }
    }
  })
</script>
<style lang="scss" scoped>
  .capturer-tools-text {
    left: 0;
    top: calc(100% + 10px);

    .arrow {
      transform: rotate(-45deg);
      top: -4px;
      left: 0;
    }

    &.v-reversed {
      left: 0;
      top: calc(-100% - 10px);

      .arrow {
        transform: rotate(-45deg);
        top: calc(100% - 4px);
        left: 0;
      }
    }
  }
</style>
