<template>
  <div
    class="relative flex justify-center items-center py-5 bg-[#33445526] w-full rounded-md dark:bg-[#32364A]"
  >
    <div class="flex items-center">
      <div class="w-[130px] truncate">{{ title }}</div>
      <el-switch v-model="showItem" />
    </div>
    <slot name="default"></slot>
  </div>
</template>

<script lang="ts" setup>
  import { AppStore } from '@/store/app'
  import { computed } from 'vue'
  import { AppCustomerModule } from '@/core/Module'

  type StringFn = () => string

  const props = defineProps<{
    label: string | StringFn | undefined
    typeFlag: string
  }>()

  const title = computed(() => {
    if (typeof props.label === 'string') {
      return props.label
    }
    return props.label?.() ?? ''
  })

  const appStore = AppStore()
  const showItem = computed({
    get() {
      return appStore.config.setup.common.showItem?.[props.typeFlag] !== false
    },
    set(v) {
      appStore.config.setup.common.showItem[props.typeFlag] = v
      appStore.saveConfig()
      // Stop Service when hide module
      if (!v) {
        const customer = AppCustomerModule.module.find(
          (item) => item.typeFlag === props.typeFlag && item.isService
        )
        if (customer) {
          customer.stop().catch()
        }
      }
    }
  })
</script>
