<script setup lang="ts">
  import { ref } from 'vue'
  import { EAPMethods, EAPPhase2Methods, useWifiQRCode } from './useQRCode'
  import { I18nT } from '@shared/lang'
  import { MessageError } from '@/util/Element'

  const { dialog, shell } = require('@electron/remote')
  const { writeFile } = require('fs')

  const foreground = ref('#000000ff')
  const background = ref('#ffffffff')

  const ssid = ref()
  const password = ref()
  const eapMethod = ref()
  const isHiddenSSID = ref(false)
  const eapAnonymous = ref(false)
  const eapIdentity = ref()
  const eapPhase2Method = ref()

  const { qrcode, encryption } = useWifiQRCode({
    ssid,
    password,
    eapMethod,
    isHiddenSSID,
    eapAnonymous,
    eapIdentity,
    eapPhase2Method,
    color: {
      background,
      foreground
    },
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
        const dataBuffer = new Buffer(base64, 'base64')
        writeFile(filePath, dataBuffer, function (err: Error | null) {
          if (err) {
            MessageError(err.message)
            return
          }
          shell.showItemInFolder(filePath)
        })
      })
  }

  const methods = [
    {
      label: 'No password',
      value: 'nopass'
    },
    {
      label: 'WPA/WPA2',
      value: 'WPA'
    },
    {
      label: 'WEP',
      value: 'WEP'
    },
    {
      label: 'WPA2-EAP',
      value: 'WPA2-EAP'
    }
  ]
</script>
<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('wifi-qr-code-generator.title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="p-3 pb-0 overflow-hidden flex-1">
      <el-scrollbar>
        <el-card>
          <el-form-item label="Encryption method" label-position="top">
            <el-select v-model="encryption" class="w-full">
              <template v-for="item in methods" :key="item.value">
                <el-option :label="item.label" :value="item.value"></el-option>
              </template>
            </el-select>
          </el-form-item>

          <el-form-item label="SSID:" label-position="top">
            <el-input v-model="ssid" placeholder="Your WiFi SSID..." />
          </el-form-item>

          <el-form-item label="Hidden SSID" label-position="top">
            <el-checkbox v-model="isHiddenSSID"> </el-checkbox>
          </el-form-item>

          <el-form-item v-if="encryption !== 'nopass'" label="Password:" label-position="top">
            <el-input
              v-model="password"
              type="password"
              placeholder="Your WiFi Password..."
              show-password
            />
          </el-form-item>
          <template v-if="encryption === 'WPA2-EAP'">
            <el-form-item label="EAP method:" label-position="top">
              <el-select v-model="eapMethod" filterable class="w-full">
                <template v-for="item in EAPMethods" :key="item">
                  <el-option :label="item" :value="item"></el-option>
                </template>
              </el-select>
            </el-form-item>
            <el-form-item label="Identity:" label-position="top">
              <el-input v-model="eapIdentity" placeholder="Your EAP Identity..." />
            </el-form-item>
            <el-form-item label="Anonymous?" label-position="top">
              <el-checkbox v-model="eapAnonymous"> </el-checkbox>
            </el-form-item>
            <el-form-item label="EAP Phase 2 method" label-position="top">
              <el-select v-model="eapPhase2Method" filterable class="w-full">
                <template v-for="item in EAPPhase2Methods" :key="item">
                  <el-option :label="item" :value="item"></el-option>
                </template>
              </el-select>
            </el-form-item>
          </template>

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
          <div v-if="qrcode" class="flex flex-col items-center gap-3">
            <el-image :src="qrcode" class="w-48" />
            <el-button @click="download"> Download qr-code </el-button>
          </div>
        </el-card>
      </el-scrollbar>
    </div>
  </div>
</template>
