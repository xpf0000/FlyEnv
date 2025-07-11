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
        <span class="text-xl">{{ I18nT('tools.escape-html-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div>
            <el-card header="Encode/Escape HTML Entities">
              <el-form-item label-position="top" label="String:">
                <el-input
                  v-model="Store.encodeInput"
                  type="textarea"
                  :rows="3"
                  placeholder="The string to escape"
                ></el-input>
              </el-form-item>
              <el-form-item label="Your string escaped :" label-position="top">
                <el-input
                  :model-value="Store.encodeOutput"
                  readonly
                  type="textarea"
                  :rows="3"
                  placeholder="Your string escaped"
                ></el-input>
              </el-form-item>
              <div class="flex justify-center">
                <el-button @click.stop="Store.copyEncode()">Copy</el-button>
              </div>
            </el-card>
          </div>
          <div>
            <el-card header="Decode/Unescape HTML Entities">
              <el-form-item label-position="top" label="Escaped String:">
                <el-input
                  v-model="Store.decodeInput"
                  type="textarea"
                  :rows="3"
                  placeholder="The string to unescape"
                ></el-input>
              </el-form-item>
              <el-form-item label="Your string unescaped :" label-position="top">
                <el-input
                  :model-value="Store.decodeOutput"
                  readonly
                  type="textarea"
                  :rows="3"
                  placeholder="Your string unescaped"
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
