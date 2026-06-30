<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span>{{ I18nT('hermes.providers') }}</span>
      </div>
    </template>
    <div class="p-5">
      <el-form label-position="top">
        <el-form-item :label="I18nT('hermes.selectProvider')">
          <el-select v-model="HermesSetup.currentProvider" class="w-full">
            <el-option
              v-for="p in HermesSetup.providers"
              :key="p.name"
              :label="p.name"
              :value="p.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="I18nT('hermes.baseUrl')">
          <el-input
            v-model="currentBaseUrl"
            :placeholder="'http://localhost:11434/v1'"
            class="w-full"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveProvider">{{ I18nT('common.action.save') }}</el-button>
        </el-form-item>
      </el-form>
      <el-divider />
      <div class="text-sm text-gray-500">
        <p>{{ I18nT('hermes.providerTip') }}</p>
      </div>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { HermesSetup } from './setup'
  import { MessageSuccess } from '@/util/Element'

  const currentBaseUrl = computed({
    get() {
      const p = HermesSetup.providers.find((i) => i.name === HermesSetup.currentProvider)
      return p?.baseUrl ?? ''
    },
    set(v) {
      const p = HermesSetup.providers.find((i) => i.name === HermesSetup.currentProvider)
      if (p) {
        p.baseUrl = v
      }
    }
  })

  const saveProvider = () => {
    MessageSuccess(I18nT('hermes.providerSaved'))
  }
</script>
