<template>
  <div
    :class="{ 'v-reversed': CapurerTool.isReversed }"
    class="capturer-tools-text bg-slate-100 dark:bg-gray-600 rounded-[6px] flex items-center justify-between gap-3 p-[6px] z-[9999] absolute"
  >
    <div
      class="z-[-1] arrow bg-slate-100 dark:bg-gray-600 rounded-[2px] w-[10px] h-[10px] absolute"
    ></div>
    <div class="flex items-center gap-2">
      <div
        :class="{
          [`bg-blue-100`]: currentFontSize === 15
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
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
          [`bg-blue-100`]: currentFontSize === 20
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
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
          [`bg-blue-100`]: currentFontSize === 25
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
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
  import { computed } from 'vue'
  import CapurerTool from './tools'

  const currentColor = computed({
    get() {
      return CapurerTool.text.color
    },
    set(v) {
      CapurerTool.text.color = v
    }
  })

  const currentFontSize = computed({
    get() {
      return CapurerTool.text.fontSize
    },
    set(v) {
      CapurerTool.text.fontSize = v
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
