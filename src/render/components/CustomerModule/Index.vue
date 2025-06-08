<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item.label" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <ListVM v-if="tab === 0"></ListVM>
      <template v-for="(item, index) in tabs" :key="index">
        <template v-if="item.isConfig">
          <ConfigVM v-if="item.index === tab" :file="item?.path ?? ''" />
        </template>
        <template v-if="item.isLog">
          <LogsVM v-if="item.index === tab" :file="item?.path ?? ''" />
        </template>
      </template>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { AppCustomerModule, AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import { computed, ComputedRef } from 'vue'
  import ListVM from './List.vue'
  import ConfigVM from './Config.vue'
  import LogsVM from './Logs.vue'
  import type { ModuleCustomer } from '@/core/ModuleCustomer'

  const current: ComputedRef<ModuleCustomer> = computed(() => {
    return AppCustomerModule.currentModule!
  })

  const tab = computed({
    get() {
      return AppModuleSetup(current.value.id as any).tab.value
    },
    set(v) {
      AppModuleSetup(current.value.id as any).tab.value = v
    }
  })

  const tabs: ComputedRef<
    {
      label: string
      index?: number
      isConfig?: boolean
      isLog?: boolean
      path?: string
    }[]
  > = computed(() => {
    const arr: any = [
      {
        label: I18nT('base.service')
      }
    ]
    let index = 0
    const configPath: any = current.value.configPath
    for (const c of configPath) {
      index += 1
      arr.push({
        index,
        isConfig: true,
        label: c.name,
        path: c.path
      })
    }
    const logPath: any = current.value.logPath
    for (const c of logPath) {
      index += 1
      arr.push({
        index,
        isLog: true,
        label: c.name,
        path: c.path
      })
    }
    console.log('arr: ', arr)
    return arr
  })
</script>
