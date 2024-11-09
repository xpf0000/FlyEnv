<template>
  <el-popover
    popper-class="host-url-qrcode"
    :show-after="1000"
    trigger="hover"
    width="264px"
    @show="onShow"
  >
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
  import { ref } from 'vue'
  import { MessageError } from '@/util/Element'

  const props = defineProps<{
    url: string
  }>()
  let showed = false
  const canvas = ref(null)
  const doSave = (url: string) => {}
  const downImg = () => {
    QRCode.toDataURL(
      props.url,
      {
        width: 300,
        margin: 1
      },
      function (err: Error, url: string) {
        if (err) {
          MessageError(err.message)
          return
        }
        doSave(url)
      }
    )
  }

  const onShow = () => {
    if (!showed) {
      showed = true
      QRCode.toCanvas(canvas.value, props.url, {
        width: 240,
        margin: 1
      })
    }
  }
</script>
