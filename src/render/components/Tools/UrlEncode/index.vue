<script setup lang="ts">
  import { watch } from 'vue'
  import Store from './store'
  import { I18nT } from '@lang/index'

  watch(
    () => Store.encodeInput,
    () => {
      Store.doEncode()
    },
    {
      immediate: true
    }
  )

  watch(
    () => Store.decodeInput,
    () => {
      Store.doDecode()
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
        <span class="text-xl">{{ I18nT('tools.url-encode-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div>
            <el-card header="Encode">
              <el-form-item label-position="top" label="Your string :">
                <el-input
                  v-model="Store.encodeInput"
                  type="textarea"
                  :rows="3"
                  placeholder="The string to encode"
                ></el-input>
              </el-form-item>
              <el-form-item label="Your string encoded :" label-position="top">
                <el-input
                  :model-value="Store.encodeOutput"
                  readonly
                  type="textarea"
                  :rows="3"
                  placeholder="Your string encoded"
                ></el-input>
              </el-form-item>
              <div class="flex justify-center">
                <el-button @click.stop="Store.copyEncode()">Copy</el-button>
              </div>
            </el-card>
          </div>
          <div>
            <el-card header="Decode">
              <el-form-item label-position="top" label="Your encoded string :">
                <el-input
                  v-model="Store.decodeInput"
                  type="textarea"
                  :rows="3"
                  placeholder="The string to decode"
                ></el-input>
              </el-form-item>
              <el-form-item label="Your string decoded :" label-position="top">
                <el-input
                  :model-value="Store.decodeOutput"
                  readonly
                  type="textarea"
                  :rows="3"
                  placeholder="Your string decoded"
                ></el-input>
              </el-form-item>
              <div class="flex justify-center">
                <el-button @click.stop="Store.copyDecode()">Copy</el-button>
              </div>
            </el-card>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>
