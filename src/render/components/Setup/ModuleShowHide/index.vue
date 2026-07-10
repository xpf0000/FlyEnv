<template>
  <div
    class="relative flex justify-center items-center py-5 bg-[#33445526] w-full rounded-md dark:bg-[#32364A]"
  >
    <div class="flex items-center">
      <div class="w-[130px] truncate">{{ title }}</div>
      <el-switch v-model="showItem" :loading="changing" :disabled="changing" />
    </div>
    <slot name="default"></slot>
  </div>
</template>

<script lang="ts" setup>
  import { AppStore } from '@/store/app'
  import { computed, ref } from 'vue'
  import { AppCustomerModule } from '@/core/Module'
  import { canSetModuleVisibility } from '@/core/ModuleVisibility'
  import type { AllAppModule } from '@/core/type'

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
  const changing = ref(false)

  const stopMatchingCustomerModule = () => {
    const customer = AppCustomerModule.module.find(
      (item) => item.typeFlag === props.typeFlag && item.isService
    )
    customer?.stop().catch()
  }

  const changeShowItem = async (visible: boolean) => {
    if (changing.value) return
    changing.value = true
    try {
      if (!(await canSetModuleVisibility(props.typeFlag as AllAppModule, visible))) return
      appStore.config.setup.common.showItem[props.typeFlag] = visible
      await appStore.saveConfig()
      if (!visible) stopMatchingCustomerModule()
    } finally {
      changing.value = false
    }
  }

  const showItem = computed({
    get() {
      return appStore.config.setup.common.showItem?.[props.typeFlag] !== false
    },
    set(v) {
      changeShowItem(v).catch()
    }
  })
</script>
