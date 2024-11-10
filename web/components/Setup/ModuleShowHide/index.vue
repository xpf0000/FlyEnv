<template>
  <el-form-item :label="title">
    <el-switch v-model="showItem" />
  </el-form-item>
</template>

<script lang="ts" setup>
  import { AppStore } from '@web/store/app'
  import { computed } from 'vue'
  import type { AllAppModule } from '@web/core/type'

  type StringFn = () => string

  const props = defineProps<{
    label: string | StringFn
    typeFlag: AllAppModule
  }>()

  const title = computed(() => {
    return typeof props.label === 'string' ? props.label : props.label()
  })

  const appStore = AppStore()

  const showItem = computed({
    get() {
      return appStore.config.setup.common.showItem?.[props.typeFlag] !== false
    },
    set(v) {
      appStore.config.setup.common.showItem[props.typeFlag] = v
    }
  })
</script>
