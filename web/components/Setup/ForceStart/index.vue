<template>
  <div class="plant-title force-start-plant">
    <span>{{ $t('util.forceStart') }}</span>
    <el-popover placement="top" popper-class="cli-to-html force-start-tooltip" width="auto">
      <template #reference>
        <yb-icon
          :svg="import('@/svg/question.svg?raw')"
          width="12"
          height="12"
          style="margin-left: 5px"
        ></yb-icon>
      </template>
      <template #default>
        <span>{{ $t('util.forceStartInfo') }}</span>
      </template>
    </el-popover>
  </div>
  <div class="main reset-pass">
    <el-switch v-model="value"></el-switch>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@web/store/app'
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
