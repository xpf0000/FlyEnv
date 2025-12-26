<template>
  <VueSvg />
  <Tools />
</template>
<script lang="ts" setup>
  import Tools from '@/capturer/tools/index.vue'
  import RectSelect from '@/capturer/store/RectSelect'
  import VueSvg from '@/components/VueSvgIcon/svg.vue'
  RectSelect.editRect = {
    x: 300,
    y: 300,
    width: 300,
    height: 300
  }
  RectSelect.selected = true
</script>
