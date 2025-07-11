<script setup lang="ts">
  import { watch } from 'vue'
  import Store from './store'
  import { I18nT } from '@lang/index'

  watch(
    () => {
      return {
        length: Store.length,
        withUppercase: Store.withUppercase,
        withLowercase: Store.withLowercase,
        withNumbers: Store.withNumbers,
        withSymbols: Store.withSymbols
      }
    },
    () => {
      Store.createToken()
    },
    {
      deep: true,
      immediate: true
    }
  )
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('token-generator.title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <div class="main p-0">
          <el-card>
            <el-form label-placement="left" label-width="140px">
              <div class="flex justify-center">
                <div>
                  <el-form-item :label="I18nT('token-generator.uppercase')">
                    <el-switch v-model="Store.withUppercase" />
                  </el-form-item>

                  <el-form-item :label="I18nT('token-generator.lowercase')">
                    <el-switch v-model="Store.withLowercase" />
                  </el-form-item>
                </div>

                <div>
                  <el-form-item :label="I18nT('token-generator.numbers')">
                    <el-switch v-model="Store.withNumbers" />
                  </el-form-item>

                  <el-form-item :label="I18nT('token-generator.symbols')">
                    <el-switch v-model="Store.withSymbols" />
                  </el-form-item>
                </div>
              </div>
            </el-form>

            <el-form-item
              :label="`${I18nT('token-generator.length')} (${Store.length})`"
              label-placement="left"
            >
              <el-slider v-model="Store.length" :min="1" :max="512" />
            </el-form-item>

            <el-input
              v-model="Store.token"
              multiline
              :placeholder="I18nT('token-generator.tokenPlaceholder')"
              readonly
              rows="3"
              autosize
              type="textarea"
              class="token-display"
            />

            <div class="mt-5 flex justify-center gap-3">
              <el-button @click="Store.copy()">
                {{ I18nT('token-generator.button.copy') }}
              </el-button>
              <el-button @click="Store.refreshToken()">
                {{ I18nT('token-generator.button.refresh') }}
              </el-button>
            </div>
          </el-card>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>
