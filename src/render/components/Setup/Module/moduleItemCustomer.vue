<template>
  <div
    class="flex items-center justify-between pr-6 module-type pb-3 pl-1 text-sm mb-3 mt-7 text-zinc-600 dark:text-gray-300 border-b border-zinc-200 dark:border-zinc-700"
  >
    <div class="flex items-center">
      <span>{{ item.label }}</span>
      <el-button class="ml-3" size="small" link @click.stop="editGroup">
        <Edit width="17" height="17" />
      </el-button>
      <el-button size="small" link @click.stop="delGroup">
        <Delete width="16" height="16" />
      </el-button>
    </div>

    <div class="inline-flex items-center gap-4">
      <el-button style="margin-left: 0" size="small" link @click.stop="showAddService">
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
  <template v-if="!item.sub.length">
    <div class="flex items-center justify-center p-5">
      <el-button :icon="Plus">{{ I18nT('setup.moduleAdd') }}</el-button>
    </div>
  </template>
  <template v-else>
    <div class="grid grid-cols-3 2xl:grid-cols-4 gap-4">
      <template v-for="(i, _j) in item.sub" :key="_j">
        <div class="flex items-center justify-center w-full">
          <ModuleShowHide :label="i.label" :type-flag="i.typeFlag"></ModuleShowHide>
        </div>
      </template>
    </div>
  </template>
</template>
<script lang="ts" setup>
  import { computed, ref, nextTick } from 'vue'
  import ModuleShowHide from '@/components/Setup/ModuleShowHide/index.vue'
  import type { AppModuleItem } from '@/core/type'
  import { Plus, Delete, Edit } from '@element-plus/icons-vue'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@lang/index'
  import { ElMessageBox } from 'element-plus'
  import { AppCustomerModule } from '@/core/Module'
  import { uuid } from '@/util'

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

  const editGroup = () => {
    const item: any = props.item
    ElMessageBox.prompt(I18nT('setup.moduleCateName'), undefined, {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      inputValue: item.label
    })
      .then(({ value }) => {
        const find = AppCustomerModule.module.find((f) => f.id === item.id)
        if (find) {
          find.label = value
          AppCustomerModule.saveModule()
        }
      })
      .catch()
  }

  const delGroup = () => {
    ElMessageBox.confirm(I18nT('setup.moduleCateDelTips'), I18nT('host.warning'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel')
    })
      .then(() => {
        AppCustomerModule.delModule(props.item as any)
      })
      .catch()
  }

  const showAddService = () => {}
</script>
