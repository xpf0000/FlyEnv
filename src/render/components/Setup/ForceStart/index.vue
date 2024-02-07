<template>
  <div class="plant-title force-start-plant">
    <span>{{ $t('util.forceStart') }}</span>
    <el-tooltip placement="top-start" popper-class="cli-to-html force-start-tooltip">
      <template #default>
        <yb-icon
          :svg="import('@/svg/question.svg?raw')"
          width="12"
          height="12"
          style="margin-left: 5px"
        ></yb-icon>
      </template>
      <template #content>
        <p>{{ $t('util.forceStartInfo') }}</p>
      </template>
    </el-tooltip>
  </div>
  <div class="main reset-pass">
    <el-switch v-model="value"></el-switch>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'
  const store = AppStore()
  const value = computed({
    get() {
      return store?.config?.setup?.forceStart ?? false
    },
    set(v) {
      store.config.setup.forceStart = v
      store.saveConfig()
    }
  })
</script>
