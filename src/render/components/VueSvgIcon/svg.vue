<template>
  <svg style="display: none">
    <template v-for="(v, id) in svgs" :key="id">
      <symbol :id="`${id}`" :viewBox="v.viewBox" v-html="v.raw"></symbol>
    </template>
  </svg>
</template>

<script lang="ts" setup>
  import { SVGStore } from '@/components/VueSvgIcon/store'
  import { computed } from 'vue'

  const store = SVGStore()
  const svgs = computed(() => {
    return store.svgs
  })
</script>

<style>
  .fa-icon {
    display: inline-block;
    fill: currentColor;
  }

  .fa-flip-h {
    transform: scale(-1, 1);
  }

  .fa-flip-v {
    transform: scale(1, -1);
  }

  .fa-flip-vh {
    transform: scale(-1, -1);
  }

  .fa-spin {
    animation: fa-spin 0.5s 0s infinite linear;
  }

  .fa-pulse {
    animation: fa-spin 1s infinite steps(8);
  }

  @keyframes fa-spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>
