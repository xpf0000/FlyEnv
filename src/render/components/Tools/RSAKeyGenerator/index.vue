<script setup lang="ts">
  import { watch } from 'vue'
  import Store from './store'
  import { I18nT } from '@lang/index'
  import { CopyDocument } from '@element-plus/icons-vue'

  watch(
    () => Store.bits,
    () => {
      Store.generateKeyPair()
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
        <span class="text-xl">{{ I18nT('tools.rsa-key-generator-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <div class="flex justify-center items-center gap-4 mb-4">
          <span class="flex-shrink-0">Bits :</span>
          <el-slider
            v-model="Store.bits"
            :debounce="Store.debounce"
            :step="8"
            :min="512"
            :max="16384"
            show-input
          />
          <el-button @click.stop="Store.generateKeyPair()">Refresh key-pair</el-button>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div>
            <el-card>
              <template #header>
                <div class="flex justify-between items-center">
                  <h3>Public key</h3>
                  <el-button
                    link
                    :icon="CopyDocument"
                    @click.stop="Store.copyPublicKey()"
                  ></el-button>
                </div>
              </template>
              <el-input
                type="textarea"
                :rows="20"
                autosize
                :model-value="Store.publicKeyPem"
              ></el-input>
            </el-card>
          </div>
          <div>
            <el-card>
              <template #header>
                <div class="flex justify-between items-center">
                  <h3>Private key</h3>
                  <el-button
                    link
                    :icon="CopyDocument"
                    @click.stop="Store.copyPrivateKey()"
                  ></el-button>
                </div>
              </template>
              <el-input
                type="textarea"
                :rows="20"
                autosize
                :model-value="Store.privateKeyPem"
              ></el-input>
            </el-card>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>
