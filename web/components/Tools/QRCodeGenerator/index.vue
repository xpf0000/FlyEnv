<script setup lang="ts">
  import { ref } from 'vue'
  import type { QRCodeErrorCorrectionLevel } from 'qrcode'
  import { useQRCode } from './useQRCode'
  import { I18nT } from '@shared/lang'

  const foreground = ref('#000000ff')
  const background = ref('#ffffffff')
  const errorCorrectionLevel = ref<QRCodeErrorCorrectionLevel>('medium')

  const errorCorrectionLevels = ['low', 'medium', 'quartile', 'high']

  const text = ref('https://macphpstudy.com')
  const { qrcode } = useQRCode({
    text,
    color: {
      background,
      foreground
    },
    errorCorrectionLevel,
    options: { width: 1024 }
  })

  const download = () => {}
</script>
<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('qr-code-generator.title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper pb-0">
      <el-card>
        <el-form-item label="Text:" label-width="140px" label-position="right">
          <el-input
            v-model="text"
            type="text"
            rows="1"
            autosize
            placeholder="Your link or text..."
          />
        </el-form-item>

        <el-form-item label="Foreground color:" label-width="140px" label-position="right">
          <el-color-picker
            v-model="foreground"
            color-format="hex"
            :show-alpha="true"
            @active-change="(v: string) => (foreground = v)"
          />
        </el-form-item>
        <el-form-item label="Background color:" label-width="140px" label-position="right">
          <el-color-picker
            v-model="background"
            color-format="hex"
            :show-alpha="true"
            @active-change="(v: string) => (background = v)"
          />
        </el-form-item>
        <el-form-item label="Error resistance:" label-width="140px" label-position="right">
          <el-select v-model="errorCorrectionLevel" class="w-full">
            <template v-for="item in errorCorrectionLevels" :key="item">
              <el-option :label="item" :value="item"></el-option>
            </template>
          </el-select>
        </el-form-item>

        <div class="flex flex-col items-center gap-3">
          <el-image :src="qrcode" class="w-48" />
          <el-button @click="download"> Download qr-code </el-button>
        </div>
      </el-card>
    </div>
  </div>
</template>
