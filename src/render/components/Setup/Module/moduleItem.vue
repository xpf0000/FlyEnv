<template>
  <div
    :style="
      {
        marginTop: index === 0 ? '15px' : null
      } as any
    "
    class="flex items-center justify-between pr-6 module-type pb-3 pl-1 text-sm mb-3 mt-7 text-zinc-600 dark:text-gray-300 border-b border-zinc-200 dark:border-zinc-700"
  >
    <div class="flex items-center">
      <span>{{ item.label }}</span>
      <template v-if="index === 0">
        <el-button class="ml-3" size="small" link>
          <yb-icon :svg="import('@/svg/add-cate.svg?raw')" width="15" height="15" />
        </el-button>
      </template>
    </div>

    <div class="inline-flex items-center gap-4">
      <el-button style="margin-left: 0" size="small" link>
        <Plus class="w-[15px] h-[15px]" />
      </el-button>
      <el-switch
        v-model="groupState"
        :loading="groupSetting"
        :disabled="groupSetting"
        size="small"
      ></el-switch>
    </div>
  </div>
  <div class="grid grid-cols-3 2xl:grid-cols-4 gap-4">
    <template v-for="(i, _j) in item.sub" :key="_j">
      <div class="flex items-center justify-center w-full">
        <ModuleShowHide :label="i.label" :type-flag="i.typeFlag"></ModuleShowHide>
      </div>
    </template>
  </div>
</template>
<script lang="ts" setup>
  import { computed, ref, nextTick } from 'vue'
  import ModuleShowHide from '@/components/Setup/ModuleShowHide/index.vue'
  import type { AppModuleItem } from '@/core/type'
  import { Plus } from '@element-plus/icons-vue'
  import { AppStore } from '@/store/app'

  const props = defineProps<{
    index: number
    item: {
      label: string
      sub: AppModuleItem[]
    }
  }>()

  const appStore = AppStore()

  const groupSetting = ref(false)

  const groupState = computed({
    get() {
      return props.item.sub.some(
        (s) => appStore.config.setup.common.showItem?.[s.typeFlag] !== false
      )
    },
    set(v) {
      groupSetting.value = true
      for (const s of props.item.sub) {
        appStore.config.setup.common.showItem[s.typeFlag] = v
      }
      appStore.saveConfig().then(() => {
        nextTick().then(() => {
          groupSetting.value = false
        })
      })
    }
  })

  const addGroup = () => {

  }
</script>
