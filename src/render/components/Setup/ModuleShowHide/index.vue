<template>
  <div
    class="relative flex justify-center items-center py-5 bg-[#33445526] w-full rounded-md dark:bg-[#32364A]"
  >
    <div class="flex items-center">
      <div class="w-[100px]">{{ title }}</div>
      <el-switch v-model="showItem" />
    </div>
    <slot name="default"></slot>
  </div>
</template>

<script lang="ts" setup>
  import { AppStore } from '@/store/app'
  import { computed } from 'vue'
  import type { AllAppModule } from '@/core/type'

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
      appStore.saveConfig()
    }
  })
</script>
