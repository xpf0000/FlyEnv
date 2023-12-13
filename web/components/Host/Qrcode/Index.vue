<template>
  <el-popover popper-class="host-url-qrcode" :show-after="1000" trigger="hover" width="264px">
    <template #reference>
      <slot></slot>
    </template>
    <template #default>
      <div class="tool">
        <yb-icon
          :svg="import('@/svg/Download.svg?raw')"
          width="15"
          height="15"
          @click.stop="downImg"
        />
      </div>
      <canvas ref="canvas" class="host-url-canvas"></canvas>
    </template>
  </el-popover>
</template>

<script lang="ts" setup>
  import QRCode from 'qrcode'
  import { ref, onMounted } from 'vue'

  const props = defineProps<{
    url: string
  }>()
  const canvas = ref(null)
  onMounted(() => {
    QRCode.toCanvas(canvas.value, props.url, {
      width: 240,
      margin: 1
    })
  })
  const downImg = () => {}
</script>

<style lang="scss">
  .host-url-qrcode {
    .tool {
      display: flex;
      align-items: center;
      justify-content: end;
      padding: 5px 0 12px;

      svg {
        &:hover {
          color: #409eff;
        }
      }
    }
    .host-url-canvas {
      width: 240px;
      height: 240px;
    }
  }
</style>
