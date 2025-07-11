<script setup lang="ts">
  import { ref } from 'vue'
  import type { QRCodeErrorCorrectionLevel } from 'qrcode'
  import { useQRCode } from './useQRCode'
  import { I18nT } from '@lang/index'
  import { MessageError } from '@/util/Element'
  import { dialog, shell, fs } from '@/util/NodeFn'

  const foreground = ref('#000000ff')
  const background = ref('#ffffffff')
  const errorCorrectionLevel = ref<QRCodeErrorCorrectionLevel>('medium')

  const errorCorrectionLevels = ['low', 'medium', 'quartile', 'high']

  const text = ref('https://flyenv.com')
  const { qrcode } = useQRCode({
    text,
    color: {
      background,
      foreground
    },
    errorCorrectionLevel,
    options: { width: 1024 }
  })

  const download = () => {
    dialog
      .showSaveDialog({
        properties: ['createDirectory', 'showOverwriteConfirmation'],
        defaultPath: `qr-code.png`
      })
      .then(({ canceled, filePath }: any) => {
        if (canceled || !filePath) {
          return
        }
        const base64 = qrcode.value.replace(/^data:image\/\w+;base64,/, '')
        fs.writeBufferBase64(filePath, base64, function (err: Error | null) {
          if (err) {
            MessageError(err.message)
            return
          }
          shell.showItemInFolder(filePath)
        })
      })
  }
</script>
<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.qr-code-generator-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <el-card>
          <el-form-item label="Data / Text:" label-width="140px" label-position="right">
            <el-input
              v-model="text"
              type="text"
              rows="1"
              autosize
              placeholder="Your link or text..."
            />
          </el-form-item>

          <el-form-item label="Foreground Color:" label-width="140px" label-position="right">
            <el-color-picker
              v-model="foreground"
              color-format="hex"
              :show-alpha="true"
              @active-change="(v: string) => (foreground = v)"
            />
          </el-form-item>
          <el-form-item label="Background Color:" label-width="140px" label-position="right">
            <el-color-picker
              v-model="background"
              color-format="hex"
              :show-alpha="true"
              @active-change="(v: string) => (background = v)"
            />
          </el-form-item>
          <el-form-item label="Error Resistance:" label-width="140px" label-position="right">
            <el-select v-model="errorCorrectionLevel" class="w-full">
              <template v-for="item in errorCorrectionLevels" :key="item">
                <el-option :label="item" :value="item"></el-option>
              </template>
            </el-select>
          </el-form-item>

          <div class="flex flex-col items-center gap-3">
            <el-image :src="qrcode" class="w-48" />
            <el-button @click="download"> Download QR Code </el-button>
          </div>
        </el-card>
      </div>
    </el-scrollbar>
  </div>
</template>
