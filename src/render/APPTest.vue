<template>
  <VueSvg />
  <Tools />
</template>
<script lang="ts" setup>
  import Tools from '@/capturer/tools/index.vue'
  import RectSelect from '@/capturer/RectSelector/RectSelect'
  import VueSvg from '@/components/VueSvgIcon/svg.vue'
  import CapturerTool from '@/capturer/tools/tools'
  RectSelect.editRect = {
    x: 300,
    y: 300,
    width: 300,
    height: 300
  }
  RectSelect.selected = true
  CapturerTool.updatePosition({
    x: 300,
    y: 300,
    width: 300,
    height: 300
  })
</script>
