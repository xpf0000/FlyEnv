<template>
  <div
    :class="{ 'v-reversed': CapurerTool.isReversed }"
    class="capturer-tools-color-and-width bg-slate-100 dark:bg-gray-600 rounded-[6px] flex items-center justify-between gap-3 p-[6px] z-[9999] absolute"
  >
    <div
      class="z-[-1] arrow bg-slate-100 dark:bg-gray-600 rounded-[2px] w-[10px] h-[10px] absolute"
    ></div>
    <div class="flex items-center gap-2">
      <div
        :class="{
          [`bg-blue-100`]: currentWidth === 5
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        @click.stop="currentWidth = 5"
      >
        <div
          class="rounded-full overflow-hidden w-[5px] h-[5px]"
          :class="{
            [`bg-[#409EFF]`]: currentWidth === 5,
            [`bg-[#333333]`]: currentWidth !== 5
          }"
        ></div>
      </div>
      <div
        :class="{
          [`bg-blue-100`]: currentWidth === 10
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        @click.stop="currentWidth = 10"
      >
        <div
          class="rounded-full overflow-hidden w-[10px] h-[10px]"
          :class="{
            [`bg-[#409EFF]`]: currentWidth === 10,
            [`bg-[#333333]`]: currentWidth !== 10
          }"
        ></div>
      </div>
      <div
        :class="{
          [`bg-blue-100`]: currentWidth === 20
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        @click.stop="currentWidth = 20"
      >
        <div
          class="rounded-full overflow-hidden w-[14px] h-[14px]"
          :class="{
            [`bg-[#409EFF]`]: currentWidth === 20,
            [`bg-[#333333]`]: currentWidth !== 20
          }"
        ></div>
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
  import { computed } from 'vue'
  import CapurerTool from './tools'

  const currentColor = computed({
    get() {
      const tool: 'square' | 'circle' | 'arrow' | 'draw' = CapurerTool.tool as any
      return CapurerTool[tool].color
    },
    set(v) {
      const tool: 'square' | 'circle' | 'arrow' | 'draw' = CapurerTool.tool as any
      CapurerTool[tool].color = v
    }
  })

  const currentWidth = computed({
    get() {
      const tool: 'square' | 'circle' | 'arrow' | 'draw' = CapurerTool.tool as any
      return CapurerTool[tool].width
    },
    set(v) {
      const tool: 'square' | 'circle' | 'arrow' | 'draw' = CapurerTool.tool as any
      CapurerTool[tool].width = v
    }
  })
</script>
<style lang="scss" scoped>
  .capturer-tools-color-and-width {
    left: 0;
    top: calc(100% + 10px);

    .arrow {
      transform: rotate(-45deg);
      top: -4px;
      left: 50px;
    }

    &.v-reversed {
      left: 0;
      top: calc(-100% - 10px);

      .arrow {
        transform: rotate(-45deg);
        top: calc(100% - 4px);
        left: 50px;
      }
    }
  }
</style>
