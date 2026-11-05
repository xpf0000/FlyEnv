<template>
  <el-drawer
    ref="project-edit-drawer"
    v-model="show"
    size="550px"
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
          <span class="ml-3">{{
            isEdit ? I18nT('common.action.edit') : I18nT('common.action.add')
          }}</span>
        </div>
        <el-button :loading="running" :disabled="running" class="shrink0" @click="doSave">
          {{ I18nT('common.action.save') }}
        </el-button>
      </div>

      <el-scrollbar class="flex-1">
        <div class="main-wapper p-3">
          <!-- 基本信息 -->
          <div class="plant-title" style="padding-top: 6px">{{
            I18nT('common.category.basicInfo')
          }}</div>
          <div class="main p-5">
            <input
              v-model.trim="item.comment"
              type="text"
              :class="'input mb-4' + (errs['comment'] ? ' error' : '')"
              :placeholder="I18nT('common.label.comment')"
            />
            <div class="path-choose mb-4">
              <input
                v-model.trim="item.path"
                type="text"
                :class="'input' + (errs['path'] ? ' error' : '')"
                :placeholder="I18nT('host.runDirectory')"
              />
              <div class="icon-block" @click="chooseRoot('path')">
                <yb-icon
                  :svg="import('@/svg/folder.svg?raw')"
                  class="choose"
                  width="18"
                  height="18"
                />
              </div>
            </div>

            <div class="ssl-switch mt-4">
              <span>{{ I18nT('host.ifIsService') }}</span>
              <el-switch v-model="item.isService"></el-switch>
            </div>
          </div>

          <!-- 语言版本 -->
          <div class="plant-title">{{ I18nT('base.version') }}</div>
          <div class="main p-5">
            <el-select
              v-model="item.binBin"
              class="w-full"
              :placeholder="I18nT('base.selectVersion')"
            >
              <el-option :value="''" :label="I18nT('host.useSysVersion')"></el-option>
              <template v-for="(v, _i) in binVersions" :key="_i">
                <el-option :value="v.bin" :label="`${v.version}-${v.bin}`"></el-option>
              </template>
            </el-select>
          </div>

          <template v-if="item.isService">
            <!-- 运行设置 -->
            <div class="plant-title">{{ I18nT('host.runSetting') }}</div>
            <div class="main p-5">
              <div class="ssl-switch mb-4">
                <span>{{ I18nT('host.exec') }}</span>
                <el-radio-group v-model="item.commandType" size="small">
                  <el-radio-button value="command" :label="I18nT('setup.module.command')">
                  </el-radio-button>
                  <el-radio-button value="file" :label="I18nT('setup.module.commandFile')">
                  </el-radio-button>
                </el-radio-group>
              </div>

              <div v-if="item.commandType === 'command'">
                <textarea
                  v-model.trim="item.runCommand"
                  style="margin-top: 0"
                  type="text"
                  :class="'input-textarea w-full' + (errs['runCommand'] ? ' error' : '')"
                  :placeholder="I18nT('common.label.startCommand')"
                ></textarea>
              </div>
              <div v-else class="path-choose">
                <input
                  v-model.trim="item.runFile"
                  type="text"
                  :class="'input' + (errs['runFile'] ? ' error' : '')"
                  :placeholder="I18nT('host.startFile')"
                />
                <div class="icon-block" @click="chooseExecFile('runFile')">
                  <yb-icon
                    :svg="import('@/svg/folder.svg?raw')"
                    class="choose"
                    width="18"
                    height="18"
                  />
                </div>
              </div>

              <template v-if="!isWindows">
                <div class="ssl-switch mt-4">
                  <span>{{ I18nT('setup.module.isSudo') }}</span>
                  <el-switch v-model="item.isSudo"></el-switch>
                </div>
              </template>
            </div>

            <!-- 端口设置 -->
            <div class="plant-title">{{ I18nT('host.portSetting') }}</div>
            <div class="main p-5">
              <div class="port-set mb-4">
                <div class="port-type">{{ I18nT('host.primaryProjectPort') }}</div>
                <input
                  v-model="projectPortInput"
                  type="text"
                  inputmode="numeric"
                  :class="'input' + (errs['projectPort'] ? ' error' : '')"
                  :placeholder="I18nT('host.tcpPort')"
                />
              </div>
              <el-alert
                v-if="storedPortsInvalid"
                :title="I18nT('host.projectPortsStoredInvalid')"
                type="warning"
                :closable="false"
                class="mb-4"
              />
              <div class="mb-2">{{ I18nT('host.additionalProjectPorts') }}</div>
              <div v-if="additionalPortInputs === undefined" class="mb-2">
                <el-button @click="additionalPortInputs = []">
                  {{ I18nT('host.removeProjectPort') }}
                </el-button>
              </div>
              <div
                v-for="(_port, index) in additionalPortInputs"
                :key="index"
                class="flex items-center gap-2 mb-2"
              >
                <input
                  v-model="additionalPortInputs![index]"
                  type="text"
                  inputmode="numeric"
                  :class="'input' + (errs.additionalProjectPorts ? ' error' : '')"
                  :aria-label="I18nT('host.additionalProjectPorts')"
                />
                <el-button
                  :icon="Delete"
                  :aria-label="I18nT('host.removeProjectPort')"
                  @click="additionalPortInputs!.splice(index, 1)"
                />
              </div>
              <el-button
                :icon="Plus"
                :disabled="additionalPortInputs === undefined"
                @click="additionalPortInputs!.push('')"
              >
                {{ I18nT('host.addProjectPort') }}
              </el-button>
              <p class="text-xs opacity-70 mt-3">{{ I18nT('host.projectPortsHint') }}</p>
              <p v-if="errs.projectPort || errs.additionalProjectPorts" class="text-red-500 mt-2">
                {{ I18nT('host.projectPortsInvalid') }}
              </p>
            </div>

            <!-- 环境变量 -->
            <div class="plant-title">{{ I18nT('host.envVar') }}</div>
            <div class="main p-5">
              <div class="ssl-switch">
                <el-radio-group v-model="item.envVarType">
                  <el-radio-button value="none" :label="I18nT('common.value.none')">
                  </el-radio-button>
                  <el-radio-button value="specify" :label="I18nT('host.specifyVar')">
                  </el-radio-button>
                  <el-radio-button value="file" :label="I18nT('host.fileVar')"> </el-radio-button>
                </el-radio-group>
              </div>

              <div v-if="item.envVarType === 'specify'" class="mt-4">
                <textarea
                  v-model.trim="item.envVar"
                  type="text"
                  class="input-textarea w-full"
                  style="margin-top: 0px"
                  :placeholder="I18nT('host.envVarTips')"
                ></textarea>
              </div>
              <div v-else-if="item.envVarType === 'file'" class="path-choose mt-4">
                <input
                  v-model.trim="item.envFile"
                  type="text"
                  class="input"
                  :placeholder="I18nT('host.fileVarTips')"
                />
                <div class="icon-block" @click="chooseRoot('envFile')">
                  <yb-icon
                    :svg="import('@/svg/folder.svg?raw')"
                    class="choose"
                    width="18"
                    height="18"
                  />
                </div>
              </div>
            </div>

            <!-- 配置文件 -->
            <div class="plant-title flex items-center justify-between">
              <span>{{ I18nT('setup.module.configPath') }}</span>
              <el-button link :icon="Plus" @click.stop="addConfigPath"></el-button>
            </div>
            <div class="main p-5">
              <template v-if="item.configPath.length === 0">
                <div class="flex justify-center">{{ I18nT('common.value.none') }}</div>
              </template>
              <template v-else>
                <div class="flex flex-col gap-4">
                  <template v-for="(c, _i) in item.configPath" :key="_i">
                    <div class="path-choose">
                      <input
                        v-model.trim="c.name"
                        type="text"
                        class="input"
                        style="height: 32px; width: 120px; flex: unset"
                        :placeholder="I18nT('common.label.name')"
                      />
                      <input
                        v-model.trim="c.path"
                        type="text"
                        class="input"
                        style="height: 32px; margin-left: 12px"
                        :placeholder="I18nT('common.label.path')"
                      />
                      <div class="icon-block" @click="chooseConfigPath(c)">
                        <yb-icon
                          :svg="import('@/svg/folder.svg?raw')"
                          class="choose"
                          width="18"
                          height="18"
                        />
                      </div>
                      <el-button
                        link
                        class="flex-shrink-0 ml-2"
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

            <!-- 日志文件 -->
            <div class="plant-title flex items-center justify-between">
              <span>{{ I18nT('setup.module.logPath') }}</span>
              <el-button link :icon="Plus" @click.stop="addLogPath"></el-button>
            </div>
            <div class="main p-5">
              <template v-if="item.logPath.length === 0">
                <div class="flex justify-center">{{ I18nT('common.value.none') }}</div>
              </template>
              <template v-else>
                <div class="flex flex-col gap-4">
                  <template v-for="(c, _i) in item.logPath" :key="_i">
                    <div class="path-choose">
                      <input
                        v-model.trim="c.name"
                        type="text"
                        class="input"
                        style="height: 32px; width: 120px; flex: unset"
                        :placeholder="I18nT('common.label.name')"
                      />
                      <input
                        v-model.trim="c.path"
                        type="text"
                        class="input"
                        style="height: 32px; margin-left: 12px"
                        :placeholder="I18nT('common.label.path')"
                      />
                      <div class="icon-block" @click="chooseLogPath(c)">
                        <yb-icon
                          :svg="import('@/svg/folder.svg?raw')"
                          class="choose"
                          width="18"
                          height="18"
                        />
                      </div>
                      <el-button
                        link
                        class="flex-shrink-0 ml-2"
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

            <!-- PID文件 -->
            <div class="plant-title">{{ I18nT('setup.module.pidPath') }}</div>
            <div class="main p-5">
              <div class="path-choose">
                <input
                  v-model.trim="item.pidPath"
                  type="text"
                  class="input"
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
          </template>

          <div class="py-5"></div>
        </div>
      </el-scrollbar>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref, watch, onUnmounted, reactive } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { merge } from 'lodash-es'
  import { Plus, Delete } from '@element-plus/icons-vue'
  import { dialog } from '@/util/NodeFn'
  import { dirname, basename, join } from '@/util/path-browserify'
  import { uuid } from '@/util/Index'
  import { AppStore } from '@/store/app'
  import type { AllAppModule } from '@/core/type'
  import type { ProjectItemType } from '@/components/LanguageProjects/ProjectItem'
  import { BrewStore } from '@/store/brew'
  import { inspectProjectPorts, validateProjectPorts } from './ports'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    isEdit: boolean
    edit: Partial<ProjectItemType>
    typeFlag: AllAppModule
  }>()

  const running = ref(false)
  const isWindows = computed(() => window.Server.isWindows)

  const item = ref<ProjectItemType>({
    id: uuid(),
    typeFlag: props.typeFlag,
    isService: true,
    path: '',
    comment: '',
    binVersion: '',
    binPath: '',
    binBin: '',
    runCommand: '',
    runFile: '',
    commandType: 'command',
    projectPort: 3000,
    configPath: [],
    logPath: [],
    pidPath: '',
    isSudo: false,
    envVarType: 'none',
    envVar: '',
    envFile: '',
    runInTerminal: false
  })

  const errs = ref({
    comment: false,
    path: false,
    runCommand: false,
    runFile: false,
    projectPort: false,
    additionalProjectPorts: false,
    ssl_cert: false,
    ssl_key: false
  })

  merge(item.value, props.edit)
  const storedPortsInvalid = props.isEdit && inspectProjectPorts(item.value).hasInvalidPorts
  const portInput = (value: unknown): string =>
    typeof value === 'number' ? String(value) : (JSON.stringify(value) ?? '')
  const projectPortInput = ref(portInput(item.value.projectPort))
  const storedAdditionalPorts = item.value.additionalProjectPorts
  const additionalPortInputs = ref<string[] | undefined>(
    storedAdditionalPorts === undefined
      ? []
      : Array.isArray(storedAdditionalPorts)
        ? storedAdditionalPorts.map(portInput)
        : undefined
  )
  const portsValidation = computed(() =>
    validateProjectPorts(
      projectPortInput.value,
      additionalPortInputs.value ?? storedAdditionalPorts
    )
  )
  watch(
    [projectPortInput, additionalPortInputs],
    () => {
      errs.value.projectPort = false
      errs.value.additionalProjectPorts = false
    },
    { deep: true }
  )
  const brewStore = BrewStore()
  const binVersions = computed(() => {
    return brewStore
      .module(props.typeFlag)
      .installed.map((p) => {
        return {
          ...p,
          bin: props.typeFlag === 'php' ? (p?.phpBin ?? join(p.path, 'bin/php')) : p.bin
        }
      })
      .filter((p) => p.version && p.bin && p.enable !== false)
  })

  watch(
    item,
    () => {
      let k: keyof typeof errs.value
      for (k in errs.value) {
        errs.value[k] = false
      }
    },
    { immediate: true, deep: true }
  )

  watch(
    () => item.value.binBin,
    (bin) => {
      const find = binVersions.value.find((b) => b.bin === bin)
      if (find) {
        item.value.binVersion = find.version
        item.value.binPath = find.path
      } else {
        item.value.binVersion = ''
        item.value.binPath = ''
      }
    }
  )

  watch(
    () => item.value.runFile,
    (path) => {
      if (path && !item.value.runCommand) {
        item.value.runCommand = `./${basename(path)}`
      }
    }
  )

  const chooseRoot = (flag: 'path' | 'envFile', choosefile = false) => {
    const options: any = {}
    let opt = []
    if (choosefile) {
      opt = ['openFile', 'showHiddenFiles']
    } else {
      opt = ['openDirectory', 'createDirectory', 'showHiddenFiles']
    }
    options.properties = opt
    dialog.showOpenDialog(options).then(({ canceled, filePaths }: any) => {
      if (canceled || filePaths.length === 0) {
        return
      }
      const [path] = filePaths
      switch (flag) {
        case 'path':
          item.value.path = path
          break
        case 'envFile':
          item.value.envFile = path
          break
      }
    })
  }

  const chooseExecFile = (flag: 'runFile' | 'pidPath') => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        item.value[flag] = filePaths[0]
        if (flag === 'runFile') {
          item.value.path = dirname(filePaths[0])
        }
      })
  }

  const addConfigPath = () => {
    const c = reactive({ name: '', path: '' })
    item.value.configPath.push(c)
  }

  const delConfig = (i: number) => {
    item.value.configPath.splice(i, 1)
  }

  const chooseConfigPath = (c: { name: string; path: string }) => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (!canceled && filePaths.length > 0) {
          c.path = filePaths[0]
          if (!c.name) {
            c.name = basename(filePaths[0])
          }
        }
      })
  }

  const addLogPath = () => {
    const c = reactive({ name: '', path: '' })
    item.value.logPath.push(c)
  }

  const delLog = (i: number) => {
    item.value.logPath.splice(i, 1)
  }

  const chooseLogPath = (c: { name: string; path: string }) => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (!canceled && filePaths.length > 0) {
          c.path = filePaths[0]
          if (!c.name) {
            c.name = basename(filePaths[0])
          }
        }
      })
  }

  const checkItem = () => {
    errs.value['path'] = item.value.path.length === 0
    if (item.value.isService) {
      errs.value['runCommand'] =
        item.value.commandType === 'command' && item.value.runCommand.length === 0
      errs.value['runFile'] = item.value.commandType === 'file' && item.value.runFile.length === 0
      errs.value.projectPort = portsValidation.value.invalidPrimary
      errs.value.additionalProjectPorts = portsValidation.value.invalidAdditional
    }

    let k: keyof typeof errs.value
    for (k in errs.value) {
      if (errs.value[k]) {
        return false
      }
    }
    return true
  }

  const doSave = () => {
    if (!checkItem()) {
      return
    }
    if (item.value.isService) {
      item.value.projectPort = portsValidation.value.projectPort!
      if (
        portsValidation.value.additionalProjectPorts.length ||
        item.value.additionalProjectPorts !== undefined
      ) {
        item.value.additionalProjectPorts = [...portsValidation.value.additionalProjectPorts]
      }
    }
    running.value = true
    callback(JSON.parse(JSON.stringify(item.value)))
    show.value = false
    running.value = false
  }

  const appStore = AppStore()
  appStore.floatBtnShow = false

  onUnmounted(() => {
    appStore.floatBtnShow = true
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
