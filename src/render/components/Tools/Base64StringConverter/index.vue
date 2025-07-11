<script setup lang="ts">
  import { watch } from 'vue'
  import Store from './store'
  import { I18nT } from '@lang/index'

  watch(
    () =>
      JSON.stringify({
        text: Store.textInput,
        safe: Store.encodeUrlSafe
      }),
    () => {
      Store.textToBase64()
    },
    {
      immediate: true
    }
  )

  watch(
    () =>
      JSON.stringify({
        text: Store.base64Input,
        safe: Store.decodeUrlSafe
      }),
    () => {
      Store.base64ToText()
    },
    {
      immediate: true
    }
  )
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.base64-string-converter-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div>
            <el-card header="String to base64">
              <el-form-item label-position="left" label="Encode URL safe">
                <el-switch v-model="Store.encodeUrlSafe"></el-switch>
              </el-form-item>
              <el-form-item label="String to encode" label-position="top">
                <el-input
                  v-model="Store.textInput"
                  type="textarea"
                  :rows="5"
                  placeholder="Put your string here..."
                ></el-input>
              </el-form-item>
              <el-form-item label="Base64 of string" label-position="top">
                <el-input
                  :model-value="Store.textOutput"
                  type="textarea"
                  :rows="5"
                  placeholder="Put your string here..."
                  readonly
                ></el-input>
              </el-form-item>
              <div class="flex justify-center">
                <el-button @click.stop="Store.copyTextOutput()">Copy base64</el-button>
              </div>
            </el-card>
          </div>
          <div>
            <el-card header="Base64 to string">
              <el-form-item label-position="left" label="Decode URL safe">
                <el-switch v-model="Store.decodeUrlSafe"></el-switch>
              </el-form-item>
              <el-form-item label="Base64 string to decode" label-position="top">
                <el-input
                  v-model="Store.base64Input"
                  type="textarea"
                  :rows="5"
                  placeholder="Put your string here..."
                ></el-input>
              </el-form-item>
              <el-form-item
                label="Decoded string"
                label-position="top"
                :error="Store.error ? 'Invalid base64 string' : null"
              >
                <el-input
                  :model-value="Store.base64Output"
                  type="textarea"
                  :rows="5"
                  placeholder="Your base64 string..."
                  readonly
                ></el-input>
              </el-form-item>
              <div class="flex justify-center">
                <el-button @click.stop="Store.copyBase64Output()">Copy decoded string</el-button>
              </div>
            </el-card>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>
