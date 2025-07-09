<template>
  <el-drawer
    ref="host-edit-drawer"
    v-model="show"
    size="500px"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    class="host-edit-drawer"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-edit">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">{{ isEdit ? I18nT('base.edit') : I18nT('base.add') }}</span>
        </div>
        <el-button :loading="running" :disabled="running" class="shrink0" @click="doSave">{{
          I18nT('base.save')
        }}</el-button>
      </div>

      <el-scrollbar class="flex-1">
        <div class="main-wapper p-3">
          <div class="main p-5">
            <input
              v-model.trim="item.label"
              type="text"
              :class="'input' + (errs['label'] ? ' error' : '')"
              :placeholder="I18nT('setup.moduleName')"
            />
            <div class="flex items-center justify-between mt-6">
              <span class="text-[15px] font-bold">{{ I18nT('setup.moduleIcon') }}</span>
              <div class="inline-flex items-center">
                <el-button link>
                  <yb-icon :key="iconKey" :svg="item.icon" width="20" height="20" />
                </el-button>
                <el-button link style="margin-left: 20px" @click.stop="chooseIcon">
                  <FolderOpened width="18" height="18" />
                </el-button>
                <el-button link style="margin-left: 6px" @click.stop="setDefaultIcon">
                  <Close width="18" height="18" />
                </el-button>
              </div>
            </div>
            <div class="ssl-switch mt-6">
              <span>{{ I18nT('setup.moduleIsService') }}</span>
              <el-switch v-model="item.isService"></el-switch>
            </div>

            <div v-if="item.isService" class="ssl-switch mt-6">
              <div class="inline-flex items-center gap-1">
                <span>{{ I18nT('setup.moduleIsOnlyRunOne') }}</span>
              </div>
              <el-switch v-model="item.isOnlyRunOne"></el-switch>
            </div>
          </div>

          <div class="plant-title flex items-center justify-between">
            <span>{{ I18nT('setup.moduleExecItem') }}</span>
            <template v-if="isLock">
              <el-tooltip placement="left" :content="I18nT('setup.module.licenseTips')">
                <el-button link @click="toLicense">
                  <Lock class="w-[17px] h-[17px]" />
                </el-button>
              </el-tooltip>
            </template>
            <template v-else>
              <el-button link :icon="Plus" @click.stop="addExecItem(undefined)"></el-button>
            </template>
          </div>
          <div class="main p-5 flex flex-col gap-3">
            <template v-if="item.item.length === 0">
              <div class="flex justify-center">{{ I18nT('base.none') }}</div>
            </template>
            <template v-else>
              <template v-for="(execItem, _index) in item.item" :key="_index">
                <div class="flex items-center justify-between gap-2">
                  <el-input v-model="execItem.name" class="w-48 ml-2" readonly></el-input>
                  <el-input v-model="execItem.comment" readonly></el-input>
                  <el-button
                    class="ml-2"
                    link
                    :icon="Edit"
                    @click.stop="addExecItem(execItem)"
                  ></el-button>
                  <el-button
                    link
                    style="margin-left: 0"
                    :icon="Delete"
                    @click.stop="delExecItem(_index)"
                  ></el-button>
                </div>
              </template>
            </template>
          </div>

          <div class="plant-title flex items-center justify-between">
            <span>{{ I18nT('setup.module.configPath') }}</span>
            <el-button link :icon="Plus" @click.stop="addConfigPath"></el-button>
          </div>
          <div class="main p-5">
            <template v-if="!item?.configPath?.length">
              <div class="flex justify-center">{{ I18nT('base.none') }}</div>
            </template>
            <template v-else>
              <div class="flex flex-col gap-4">
                <template v-for="(c, _i) in item.configPath" :key="_i">
                  <div class="path-choose pb-1">
                    <input
                      v-model.trim="c.name"
                      type="text"
                      class="input"
                      style="height: 32px; width: 120px; flex: unset"
                      :placeholder="I18nT('setup.module.name')"
                    />
                    <input
                      v-model.trim="c.path"
                      type="text"
                      class="input"
                      style="height: 32px; margin-left: 40px"
                      :placeholder="I18nT('setup.module.path')"
                    />
                    <div class="icon-block" @click="chooseExecFile(c)">
                      <yb-icon
                        :svg="import('@/svg/folder.svg?raw')"
                        class="choose"
                        width="18"
                        height="18"
                      />
                    </div>
                    <el-button
                      link
                      class="flex-shrink-0 ml-4"
                      style="padding: 0"
                      @click.stop="delConfig(_i)"
                    >
                      <Delete width="17" height="17"></Delete>
                    </el-button>
                  </div>
                </template>
              </div>
            </template>
          </div>

          <div class="plant-title flex items-center justify-between">
            <span>{{ I18nT('setup.module.logPath') }}</span>
            <el-button link :icon="Plus" @click.stop="addLogPath"></el-button>
          </div>
          <div class="main p-5">
            <template v-if="!item?.logPath?.length">
              <div class="flex justify-center">{{ I18nT('base.none') }}</div>
            </template>
            <template v-else>
              <div class="flex flex-col gap-4">
                <template v-for="(c, _i) in item.logPath" :key="_i">
                  <div class="path-choose pb-1">
                    <input
                      v-model.trim="c.name"
                      type="text"
                      class="input"
                      style="height: 32px; width: 120px; flex: unset"
                      :placeholder="I18nT('setup.module.name')"
                    />
                    <input
                      v-model.trim="c.path"
                      type="text"
                      class="input"
                      style="height: 32px; margin-left: 40px"
                      :placeholder="I18nT('setup.module.path')"
                    />
                    <div class="icon-block" @click="chooseExecFile(c)">
                      <yb-icon
                        :svg="import('@/svg/folder.svg?raw')"
                        class="choose"
                        width="18"
                        height="18"
                      />
                    </div>
                    <el-button
                      link
                      class="flex-shrink-0 ml-4"
                      style="padding: 0"
                      @click.stop="delLog(_i)"
                    >
                      <Delete width="17" height="17"></Delete>
                    </el-button>
                  </div>
                </template>
              </div>
            </template>
          </div>

          <div class="py-5"></div>
        </div>
      </el-scrollbar>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup, AsyncComponentShow } from '@/util/AsyncComponent'
  import { merge } from 'lodash-es'
  import { Close, Delete, Edit, FolderOpened, Lock, Plus } from '@element-plus/icons-vue'
  import { uuid } from '@/util/Index'
  import { ModuleCustomerExecItem, ModuleDefaultIcon } from '@/core/ModuleCustomer'
  import { AppCustomerModule, type CustomerModuleItem } from '@/core/Module'
  import { getExtractedSVG } from 'svg-inline-loader'
  import Base from '@/core/Base'
  import { SetupStore } from '@/components/Setup/store'
  import Router from '@/router'
  import { AppStore } from '@/store/app'
  import { dialog, fs } from '@/util/NodeFn'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    isEdit: boolean
    edit: any
  }>()
  const iconKey = ref(uuid())
  const running = ref(false)
  const item = ref<CustomerModuleItem>({
    configPath: [],
    isCustomer: true,
    logPath: [],
    typeFlag: '',
    id: uuid(),
    label: '',
    isService: true,
    isOnlyRunOne: true,
    moduleType: '',
    icon: ModuleDefaultIcon,
    item: []
  })
  const errs = ref({
    label: false,
    icon: false
  })
  merge(item.value, props.edit)

  watch(
    item,
    () => {
      let k: keyof typeof errs.value
      for (k in errs.value) {
        errs.value[k] = false
      }
    },
    {
      immediate: true,
      deep: true
    }
  )

  const checkItem = () => {
    errs.value['label'] = item.value.label.length === 0
    errs.value['icon'] = item.value.icon.length === 0

    let k: keyof typeof errs.value
    for (k in errs.value) {
      if (errs.value[k]) {
        return false
      }
    }
    return true
  }

  const chooseIcon = () => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles'],
        filters: [
          {
            name: 'SVG Files',
            extensions: ['svg']
          }
        ]
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const file = filePaths[0]
        fs.readFile(file).then((svg: string) => {
          const config = {
            removeTags: true,
            removingTags: ['p-id', 'id', 'class', 'title', 'desc', 'defs', 'style'],
            removingTagAttrs: [
              't',
              'version',
              'p-id',
              'id',
              'class',
              'title',
              'desc',
              'defs',
              'style',
              'xmlns',
              'xmlns:xlink'
            ]
          }
          item.value.icon = getExtractedSVG(svg, config)
          iconKey.value = uuid()
        })
      })
  }

  const setDefaultIcon = () => {
    item.value.icon = ModuleDefaultIcon
    iconKey.value = uuid()
  }

  let EditVM: any
  import('./moduleExecItemAdd.vue').then((res) => {
    EditVM = res.default
  })

  const addExecItem = (i: any) => {
    AsyncComponentShow(EditVM, {
      isEdit: !!i,
      edit: i
    }).then((res: any) => {
      console.log('addExecItem res: ', res)
      const save = reactive(new ModuleCustomerExecItem(res))
      save.stop = save.stop.bind(save)
      save.start = save.start.bind(save)
      save.onStart = save.onStart.bind(save)

      save.pid = ''
      save.running = false
      save.run = false
      if (!i) {
        item.value.item.push(save)
      } else {
        const find = AppCustomerModule.module
          .map((m) => m.item)
          .flat()
          .find((f) => f.id === i.id)
        if (find) {
          find.stop().then().catch()
        }
        const index = item.value.item.findIndex((f) => f.id === i.id)
        if (index >= 0) {
          item.value.item.splice(index, 1, save)
        }
      }
    })
  }

  const delExecItem = (index: number) => {
    Base._Confirm(I18nT('base.areYouSure'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        const i = item.value.item[index]
        const find = AppCustomerModule.module
          .map((m) => m.item)
          .flat()
          .find((f) => f.id === i.id)
        if (find) {
          find.stop().then().catch()
        }
        item.value.item.splice(index, 1)
      })
      .catch(() => {})
  }

  const delConfig = (i: number) => {
    item.value.configPath!.splice(i, 1)
  }

  const delLog = (i: number) => {
    item.value.logPath!.splice(i, 1)
  }

  const addLogPath = () => {
    const c = reactive({
      name: '',
      path: ''
    })
    if (!item.value?.logPath) {
      item.value.logPath = reactive([])
    }
    item.value.logPath!.push(c)
  }

  const addConfigPath = () => {
    const c = reactive({
      name: '',
      path: ''
    })
    if (!item.value?.configPath) {
      item.value.configPath = reactive([])
    }
    item.value.configPath!.push(c)
  }

  const chooseExecFile = (flag: { name: string; path: string }) => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        flag.path = filePaths[0]
      })
  }

  const doSave = () => {
    if (!checkItem()) {
      return
    }
    console.log('item.value: ', item.value)
    callback(JSON.parse(JSON.stringify(item.value)))
    show.value = false
  }

  const appStore = AppStore()
  const setupStore = SetupStore()

  const isLock = computed(() => {
    return !setupStore.isActive && item.value.item.length > 2
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

  onMounted(() => {})
  onUnmounted(() => {})

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
