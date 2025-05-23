<template>
  <div class="h-full overflow-hidden">
    <el-scrollbar>
      <ul class="menu top-menu">
        <template v-for="(item, index) in allList" :key="index">
          <ModuleItem :item="item" :index="index" />
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

  const appStore = AppStore()

  const allList = computed(() => {
    return AppModuleTypeList.map((m) => {
      const sub = AppModules.filter((a) => a?.moduleType === m || (!a?.moduleType && m === 'other'))
      sub.sort((a, b) => {
        let lowerA = a.typeFlag.toLowerCase()
        let lowerB = b.typeFlag.toLowerCase()
        if (lowerA < lowerB) return -1
        if (lowerA > lowerB) return 1
        return 0
      })
      return {
        label: I18nT(`aside.${m}`),
        sub
      }
    }).filter((s) => s.sub.length > 0)
  })
</script>
