<template>
  <div class="h-full overflow-hidden">
    <el-scrollbar>
      <ul class="menu top-menu">
        <ModuleItem :item="firstItem" :index="0" />
        <template v-for="(item, _index) in customerList" :key="item.id">
          <ModuleItemCustomer :is-customer="true" :item="item" :index="_index + 1" />
        </template>
        <template v-for="(item, _index) in allList" :key="_index">
          <ModuleItem :item="item" :index="_index + 1" />
        </template>
      </ul>
    </el-scrollbar>
  </div>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppModuleTypeList } from '@/core/type'
  import { AppModules } from '@/core/App'
  import { I18nT } from '@lang/index'
  import ModuleItem from './moduleItem.vue'
  import { AppCustomerModule } from '@/core/Module'
  import ModuleItemCustomer from './moduleItemCustomer.vue'

  const platformAppModules = computed(() => {
    let platform: any = ''
    if (window.Server.isMacOS) {
      platform = 'macOS'
    } else if (window.Server.isWindows) {
      platform = 'Windows'
    } else if (window.Server.isLinux) {
      platform = 'Linux'
    }
    if (!platform) {
      return []
    }
    return AppModules.filter((a) => !a.platform || a.platform.includes(platform))
  })

  const firstItem = computed(() => {
    const m = 'site'
    const sub = platformAppModules.value.filter((a) => a?.moduleType === m)
    sub.sort((a, b) => {
      const lowerA = a.typeFlag.toLowerCase()
      const lowerB = b.typeFlag.toLowerCase()
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
      const sub = platformAppModules.value.filter(
        (a) => a?.moduleType === m || (!a?.moduleType && m === 'other')
      )
      sub.sort((a, b) => {
        const lowerA = a.typeFlag.toLowerCase()
        const lowerB = b.typeFlag.toLowerCase()
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
