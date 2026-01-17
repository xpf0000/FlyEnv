<template>
  <template v-if="likeID.includes(item.id)">
    <StarFilled class="w-6 h-6 text-emerald-500 ml-2" @click.stop="AppToolStore.doUnLike(item)" />
  </template>
  <template v-else>
    <Star class="w-5 h-5 hover:text-emerald-500 ml-2" @click.stop="AppToolStore.doLike(item)" />
  </template>
</template>
<script lang="ts" setup>
  import { computed, ComputedRef } from 'vue'
  import { AppToolStore } from '@/components/Tools/store'
  import { Star, StarFilled } from '@element-plus/icons-vue'
  import { AppToolModules } from '@/core/AppTool'
  import type { AppToolModuleItem } from '@/core/type'
  const likeID = computed(() => {
    return AppToolStore.like
  })

  const PlatformToolModules = computed(() => {
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
    return AppToolModules.filter((a) => !a.platform || a.platform.includes(platform))
  })

  const item: ComputedRef<AppToolModuleItem> = computed(() => {
    const all = [...AppToolStore.custom, ...PlatformToolModules.value]
    return all.find((a) => a.id === AppToolStore.id) as any
  })
</script>
