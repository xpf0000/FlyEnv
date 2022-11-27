<template>
  <div class="vue-tour-mask"
    ><svg style="width: 100%; height: 100%">
      <defs>
        <mask id="vue-tour-svg-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white"></rect>
          <rect
            :x="rect.left - 10"
            :y="rect.top - 10"
            rx="2"
            :width="rect.width + 20"
            :height="rect.height + 20"
            fill="black"
            class="vue-tour-svg-mask-animated"
          ></rect>
        </mask>
      </defs>
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.5)"
        mask="url(#vue-tour-svg-mask)"
      ></rect>
      <rect
        fill="transparent"
        pointer-events="auto"
        x="0"
        y="0"
        width="100%"
        :height="topHeight"
      ></rect>
      <rect
        fill="transparent"
        pointer-events="auto"
        x="0"
        y="0"
        :width="leftWidth"
        height="100%"
      ></rect>
      <rect
        fill="transparent"
        pointer-events="auto"
        x="0"
        :y="rect.bottom + 10"
        width="100%"
        :height="`calc(100vh - ${rect.bottom + 10}px)`"
      ></rect>
      <rect
        fill="transparent"
        pointer-events="auto"
        :x="rect.right + 10"
        y="0"
        :width="`calc(100vw - ${rect.right + 10}px)`"
        height="100%"
      ></rect></svg
  ></div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { TourCenter } from './index'
  const rect = computed<DOMRect>(() => {
    return TourCenter.rect ?? new DOMRect()
  })
  const topHeight = computed(() => {
    return Math.max(rect.value.top - 10, 0)
  })
  const leftWidth = computed(() => {
    return Math.max(rect.value.left - 10, 0)
  })
</script>

<style lang="scss">
  .vue-tour-mask-wapper {
    position: fixed;
    left: 0;
    top: 0;
    width: 100vw;
    height: 100vh;
    z-index: 2900;
  }
  .vue-tour-mask {
    position: fixed;
    inset: 0;
    z-index: 2900;
    pointer-events: none;

    .vue-tour-svg-mask-animated {
      transition: all 0.35s;
    }
  }
</style>
