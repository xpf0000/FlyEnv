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
  import { dialog, shell, fs } from '@/util/NodeFn'

  const props = defineProps<{
    url: string
  }>()
  let showed = false
  const canvas = ref(null)
  const doSave = (url: string) => {
    dialog
      .showSaveDialog({
        properties: ['createDirectory', 'showOverwriteConfirmation'],
        defaultPath: `${props.url}.png`
      })
      .then(({ canceled, filePath }: any) => {
        if (canceled || !filePath) {
          return
        }
        const base64 = url.replace(/^data:image\/\w+;base64,/, '')
        // const dataBuffer = new Buffer(base64, 'base64')
        fs.writeBufferBase64(filePath, base64, function (err: Error | null) {
          if (err) {
            MessageError(err.message)
            return
          }
          shell.showItemInFolder(filePath)
        })
      })
  }
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
