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
        <el-button class="shrink0" @click="doSave">{{ I18nT('base.save') }}</el-button>
      </div>

      <el-scrollbar class="flex-1">
        <div class="main-wapper p-3">
          <div class="main p-5">
            <input
              v-model.trim="item.name"
              type="text"
              :class="'input' + (errs['name'] ? ' error' : '')"
              :placeholder="I18nT('setup.module.name')"
            />
            <input
              v-model.trim="item.comment"
              type="text"
              class="input mt-6"
              :placeholder="I18nT('setup.module.comment')"
            />
            <template v-if="!isWindows">
              <div class="ssl-switch mt-6">
                <span>{{ I18nT('setup.module.isSudo') }}</span>
                <el-switch v-model="item.isSudo"></el-switch>
              </div>
            </template>
          </div>

          <div class="main mt-5 p-5">
            <div class="ssl-switch">
              <span>{{ I18nT('setup.module.exec') }}</span>
              <el-radio-group v-model="item.commandType" size="small">
                <el-radio-button value="command" :label="I18nT('setup.module.command')">
                </el-radio-button>
                <el-radio-button value="file" :label="I18nT('setup.module.commandFile')">
                </el-radio-button>
              </el-radio-group>
            </div>

            <div v-if="item.commandType === 'command'" class="mt-6">
              <textarea
                v-model.trim="item.command"
                type="text"
                class="input-textarea w-full"
                :class="{
                  error: !!errs['command']
                }"
                style="margin-top: 12px"
                :placeholder="I18nT('setup.module.command')"
              ></textarea>
            </div>
            <div v-else-if="item.commandType === 'file'" class="path-choose pb-4">
              <input
                v-model.trim="item.commandFile"
                type="text"
                class="mt-4 input"
                :class="{
                  error: !!errs['commandFile']
                }"
                :placeholder="I18nT('setup.module.commandFile')"
              />
              <div class="icon-block" @click="chooseExecFile('commandFile')">
                <yb-icon
                  :svg="import('@/svg/folder.svg?raw')"
                  class="choose"
                  width="18"
                  height="18"
                />
              </div>
            </div>
          </div>

          <div class="plant-title flex items-center justify-between">
            <span>{{ I18nT('setup.module.pidPath') }}</span>
          </div>
          <div class="main p-5">
            <div class="path-choose pb-1">
              <input
                v-model.trim="item.pidPath"
                type="text"
                class="input"
                style="height: 32px"
                :placeholder="I18nT('setup.module.pidPath')"
              />
              <div class="icon-block" @click="chooseExecFile('pidPath')">
                <yb-icon
                  :svg="import('@/svg/folder.svg?raw')"
                  class="choose"
                  width="18"
                  height="18"
                />
              </div>
            </div>
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
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { merge } from 'lodash-es'
  import { uuid } from '@/util/Index'
  import type { CustomerModuleExecItem } from '@/core/Module'
  import { Delete, Plus } from '@element-plus/icons-vue'
  import { dialog } from '@/util/NodeFn'

  const isMacOS = computed(() => {
    return window.Server.isMacOS
  })
  const isWindows = computed(() => {
    return window.Server.isWindows
  })
  const isLinux = computed(() => {
    return window.Server.isLinux
  })

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    isEdit: boolean
    edit: any
  }>()
  const item = ref<CustomerModuleExecItem>({
    id: uuid(),
    name: '',
    comment: '',
    command: '',
    commandFile: '',
    commandType: 'command',
    configPath: [],
    isSudo: false,
    logPath: [],
    pidPath: ''
  })
  const errs = ref({
    name: false,
    command: false,
    commandFile: false
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
    errs.value['name'] = item.value.name.length === 0
    errs.value['command'] = item.value.commandType === 'command' && item.value.command.length === 0
    errs.value['commandFile'] =
      item.value.commandType === 'file' && item.value.commandFile.length === 0

    let k: keyof typeof errs.value
    for (k in errs.value) {
      if (errs.value[k]) {
        return false
      }
    }
    return true
  }

  const chooseExecFile = (flag: 'commandFile' | 'pidPath' | { name: string; path: string }) => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        if (typeof flag === 'string') {
          item.value[flag] = filePaths[0]
        } else {
          flag.path = filePaths[0]
        }
      })
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

  const doSave = () => {
    if (!checkItem()) {
      return
    }
    callback(JSON.parse(JSON.stringify(item.value)))
    show.value = false
  }

  onMounted(() => {})
  onUnmounted(() => {})

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
