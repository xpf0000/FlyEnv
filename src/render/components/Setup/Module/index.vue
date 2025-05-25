<template>
  <div class="h-full overflow-hidden">
    <el-scrollbar>
      <ul class="menu top-menu">
        <ModuleItem :item="firstItem" :index="0" />
        <template v-for="(item, index) in customerList" :key="item.id">
          <ModuleItemCustomer :is-customer="true" :item="item" :index="index + 1" />
        </template>
        <template v-for="(item, index) in allList" :key="index">
          <ModuleItem :item="item" :index="index + 1" />
        </template>
      </ul>
    </el-scrollbar>
  </div>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppModuleTypeList } from '@/core/type'
  import { AppModules } from '@/core/App'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@lang/index'
  import ModuleItem from './moduleItem.vue'
  import { AppCustomerModule } from '@/core/Module'
  import ModuleItemCustomer from './moduleItemCustomer.vue'

  const appStore = AppStore()

  const firstItem = computed(() => {
    const m = 'site'
    const sub = AppModules.filter((a) => a?.moduleType === m)
    sub.sort((a, b) => {
      let lowerA = a.typeFlag.toLowerCase()
      let lowerB = b.typeFlag.toLowerCase()
      if (lowerA < lowerB) return -1
      if (lowerA > lowerB) return 1
      return 0
    })
    return {
      moduleType: m,
      label: I18nT(`aside.site`),
      sub
    }
  })

  const allList = computed(() => {
    return AppModuleTypeList.filter((f) => f !== 'site').map((m) => {
      const sub = AppModules.filter((a) => a?.moduleType === m || (!a?.moduleType && m === 'other'))
      sub.sort((a, b) => {
        let lowerA = a.typeFlag.toLowerCase()
        let lowerB = b.typeFlag.toLowerCase()
        if (lowerA < lowerB) return -1
        if (lowerA > lowerB) return 1
        return 0
      })
      return {
        moduleType: m,
        label: I18nT(`aside.${m}`),
        sub
      }
    })
  })

  const customerList = computed(() => {
    return AppCustomerModule.moduleCate.map((m) => {
      const sub = AppCustomerModule.module.filter((s) => {
        return s.moduleType === m.moduleType
      })
      return {
        ...m,
        sub
      }
    })
  })
</script>
