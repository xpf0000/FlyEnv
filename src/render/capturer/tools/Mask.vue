<template>
  <div
    :class="{ 'v-reversed': CapurerTool.isReversed }"
    class="capturer-tools-mask bg-slate-100 dark:bg-gray-600 rounded-[6px] flex items-center justify-between gap-3 p-[6px] z-[9999] absolute"
  >
    <div
      class="z-[-1] arrow bg-slate-100 dark:bg-gray-600 rounded-[2px] w-[10px] h-[10px] absolute"
    ></div>
    <div class="flex items-center gap-2">
      <div
        :class="{
          [`bg-blue-100 `]: currentWidth === 5 && maskType === 'hand',
          [`hover:bg-slate-200`]: maskType === 'hand'
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center"
        @click.stop="currentWidth = 5"
      >
        <div
          class="rounded-full overflow-hidden w-[5px] h-[5px]"
          :class="{
            [`bg-[#BBBBBB]`]: maskType === 'area',
            [`bg-[#409EFF]`]: currentWidth === 5 && maskType === 'hand',
            [`bg-[#333333]`]: currentWidth !== 5 && maskType === 'hand'
          }"
        ></div>
      </div>
      <div
        :class="{
          [`bg-blue-100 `]: currentWidth === 10 && maskType === 'hand',
          [`hover:bg-slate-200`]: maskType === 'hand'
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center"
        @click.stop="currentWidth = 10"
      >
        <div
          class="rounded-full overflow-hidden w-[10px] h-[10px]"
          :class="{
            [`bg-[#BBBBBB]`]: maskType === 'area',
            [`bg-[#409EFF]`]: currentWidth === 10 && maskType === 'hand',
            [`bg-[#333333]`]: currentWidth !== 10 && maskType === 'hand'
          }"
        ></div>
      </div>
      <div
        :class="{
          [`bg-blue-100 `]: currentWidth === 20 && maskType === 'hand',
          [`hover:bg-slate-200`]: maskType === 'hand'
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center"
        @click.stop="currentWidth = 20"
      >
        <div
          class="rounded-full overflow-hidden w-[14px] h-[14px]"
          :class="{
            [`bg-[#BBBBBB]`]: maskType === 'area',
            [`bg-[#409EFF]`]: currentWidth === 20 && maskType === 'hand',
            [`bg-[#333333]`]: currentWidth !== 20 && maskType === 'hand'
          }"
        ></div>
      </div>
    </div>
    <div class="h-[16px] w-[1px] bg-gray-200"></div>
    <div class="flex items-center gap-2">
      <div
        :class="{
          [`bg-blue-100`]: maskType === 'area'
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        @click.stop="maskType = 'area'"
      >
        <yb-icon
          :class="{
            [`text-[#409EFF]`]: maskType === 'area'
          }"
          class="p-[1px]"
          :svg="import('@/svg/area.svg?raw')"
          width="16"
          height="16"
        />
      </div>
      <div
        :class="{
          [`bg-blue-100`]: maskType === 'hand'
        }"
        class="w-[24px] h-[24px] p-[3px] rounded-[4px] flex items-center justify-center hover:bg-slate-200"
        @click.stop="maskType = 'hand'"
      >
        <yb-icon
          :class="{
            [`text-[#409EFF]`]: maskType === 'hand'
          }"
          :svg="import('@/svg/tumo.svg?raw')"
          width="16"
          height="16"
        />
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import CapurerTool from './tools'

  const maskType = computed({
    get() {
      return CapurerTool.mask.type
    },
    set(v) {
      CapurerTool.mask.type = v
    }
  })

  const currentWidth = computed({
    get() {
      return CapurerTool.mask.width
    },
    set(v) {
      CapurerTool.mask.width = v
    }
  })
</script>
<style lang="scss" scoped>
  .capturer-tools-mask {
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
