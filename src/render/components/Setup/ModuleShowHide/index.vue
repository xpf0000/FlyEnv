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
  import { AppModules } from '@/core/App'
  import { BrewStore } from '@/store/brew'
  import { AppCustomerModule } from '@/core/Module'

  type StringFn = () => string

  const props = defineProps<{
    label: string | StringFn
    typeFlag: AllAppModule
  }>()

  const title = computed(() => {
    return typeof props.label === 'string' ? props.label : props.label()
  })

  const appStore = AppStore()
  const brewStore = BrewStore()
  const showItem = computed({
    get() {
      return appStore.config.setup.common.showItem?.[props.typeFlag] !== false
    },
    set(v) {
      appStore.config.setup.common.showItem[props.typeFlag] = v
      appStore.saveConfig()
      // Stop Service when hide module
      if (!v) {
        const find = AppModules.find((v) => v.typeFlag === v.typeFlag && v.isService)
        if (find) {
          brewStore.module(props.typeFlag).stop().catch()
          return
        }
        const customer = AppCustomerModule.module.find(
          (v) => v.typeFlag === v.typeFlag && v.isService
        )
        if (customer) {
          customer.stop().catch()
        }
      }
    }
  })
</script>
