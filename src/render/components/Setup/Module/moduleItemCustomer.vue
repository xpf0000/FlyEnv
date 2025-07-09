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
      <template v-if="isLock">
        <el-tooltip placement="left" :content="I18nT('setup.module.licenseTips')">
          <el-button size="small" link @click="toLicense">
            <Lock class="w-[17px] h-[17px]" />
          </el-button>
        </el-tooltip>
      </template>
      <template v-else>
        <el-button size="small" link @click.stop="showAddModule(undefined)">
          <Plus class="w-[17px] h-[17px]" />
        </el-button>
      </template>
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
      <template v-if="isLock">
        <el-button :icon="Lock" @click.stop="toLicense">{{ I18nT('setup.moduleAdd') }}</el-button>
      </template>
      <template v-else>
        <el-button :icon="Plus" @click.stop="showAddModule(undefined)">{{
          I18nT('setup.moduleAdd')
        }}</el-button>
      </template>
    </div>
  </template>
  <template v-else>
    <div class="grid grid-cols-3 2xl:grid-cols-4 gap-4">
      <template v-for="(i, _j) in item.sub" :key="_j">
        <div class="flex items-center justify-center w-full">
          <ModuleShowHide :label="i.label" :type-flag="i.typeFlag">
            <template #default>
              <div class="absolute top-0 left-0 right-0">
                <el-button link class="absolute left-1 top-1" @click.stop="showAddModule(i)">
                  <Edit width="16" height="16"></Edit>
                </el-button>
                <el-button link class="absolute right-1 top-1" @click.stop="doDelModule(i, _j)">
                  <Delete width="16" height="16"></Delete>
                </el-button>
              </div>
            </template>
          </ModuleShowHide>
        </div>
      </template>
    </div>
  </template>
</template>
<script lang="ts" setup>
  import { computed, ref, nextTick, reactive } from 'vue'
  import ModuleShowHide from '@/components/Setup/ModuleShowHide/index.vue'
  import { Plus, Delete, Edit, Lock } from '@element-plus/icons-vue'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@lang/index'
  import { ElMessageBox } from 'element-plus'
  import { AppCustomerModule } from '@/core/Module'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { ModuleCustomer } from '@/core/ModuleCustomer'
  import Base from '@/core/Base'
  import { SetupStore } from '@/components/Setup/store'
  import Router from '@/router'

  const props = defineProps<{
    index: number
    item: {
      label: string
      moduleType: string
      sub: ModuleCustomer[]
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
        const find = AppCustomerModule.moduleCate.find((f) => f.id === item.id)
        if (find) {
          find.label = value
          AppCustomerModule.saveModuleCate()
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
        AppCustomerModule.delModuleCate(props.item as any)
      })
      .catch()
  }

  let EditVM: any
  import('./module/moduleAdd.vue').then((res) => {
    EditVM = res.default
  })
  const showAddModule = (edit: any) => {
    AsyncComponentShow(EditVM, {
      edit: edit ? JSON.parse(JSON.stringify(edit)) : undefined,
      isEdit: !!edit
    }).then((res) => {
      console.log('res: ', res)
      const save = reactive(new ModuleCustomer(res))
      save.moduleType = props.item.moduleType
      save.onExecStart = save.onExecStart.bind(save)
      save.start = save.start.bind(save)
      save.stop = save.stop.bind(save)
      save.watchShowHide = save.watchShowHide.bind(save)
      save.watchShowHide()

      if (!edit) {
        AppCustomerModule.module.unshift(save)
      } else {
        const index = AppCustomerModule.module.findIndex((f) => f.id === edit.id)
        if (index >= 0) {
          const find = AppCustomerModule.module[index]
          find.destroy()
          AppCustomerModule.module.splice(index, 1, save)
        }
      }
      AppCustomerModule.saveModule()
    })
  }

  const doDelModule = (item: ModuleCustomer) => {
    Base._Confirm(I18nT('base.areYouSure'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        const findIndex = AppCustomerModule.module.findIndex((f) => f.id === item.id)
        if (findIndex >= 0) {
          const find = AppCustomerModule.module[findIndex]
          find.destroy()
          AppCustomerModule.module.splice(findIndex, 1)
          AppCustomerModule.saveModule()
        }
      })
      .catch()
  }

  const setupStore = SetupStore()

  const isLock = computed(() => {
    return !setupStore.isActive && AppCustomerModule.module.length > 2
  })

  const toLicense = () => {
    setupStore.tab = 'licenses'
    appStore.currentPage = '/setup'
    Router.push({
      path: '/setup'
    })
      .then()
      .catch()
  }
</script>
