<template>
  <el-drawer
    ref="project-edit-drawer"
    v-model="show"
    size="600px"
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
        <el-button :loading="running" :disabled="running" class="shrink0" @click="doSave">
          {{ I18nT('base.save') }}
        </el-button>
      </div>

      <el-scrollbar class="flex-1">
        <div class="main-wapper p-3">
          <div class="plant-title" style="padding-top: 6px">{{ I18nT('base.baseInfo') }}</div>
          <div class="main p-5">
            <input
              v-model.trim="item.comment"
              type="text"
              :class="'input mb-4' + (errs.comment ? ' error' : '')"
              :placeholder="I18nT('host.comment')"
            />
            <div class="path-choose mb-4">
              <input
                v-model.trim="item.path"
                type="text"
                :class="'input' + (errs.path ? ' error' : '')"
                :placeholder="I18nT('host.runDirectory')"
                @change="onProjectPathChange"
              />
              <div class="icon-block" @click="chooseProjectPath">
                <yb-icon
                  :svg="import('@/svg/folder.svg?raw')"
                  class="choose"
                  width="18"
                  height="18"
                />
              </div>
            </div>
          </div>

          <div class="plant-title">RoadRunner</div>
          <div class="main p-5">
            <el-select
              v-model="item.binBin"
              class="w-full mb-4"
              :placeholder="I18nT('base.selectVersion')"
            >
              <el-option :value="''" :label="I18nT('host.useSysVersion')"></el-option>
              <template v-for="(v, _i) in roadRunnerVersions" :key="_i">
                <el-option :value="v.bin" :label="`${v.version}-${v.bin}`"></el-option>
              </template>
            </el-select>

            <el-radio-group
              v-model="item.roadRunnerPreset"
              class="w-full"
              size="small"
              @change="onPresetChange"
            >
              <el-radio-button
                v-for="preset in presets"
                :key="preset.value"
                :value="preset.value"
                :label="preset.label"
              />
            </el-radio-group>
          </div>

          <template v-if="needsPHP">
            <div class="plant-title">{{ I18nT('base.phpVersion') }}</div>
            <div class="main p-5">
              <el-select
                v-model="item.roadRunnerPHPBin"
                class="w-full"
                :placeholder="I18nT('base.selectPhpVersion')"
              >
                <el-option :value="''" :label="I18nT('host.useSysVersion')"></el-option>
                <template v-for="(v, _i) in phpVersions" :key="_i">
                  <el-option :value="v.bin" :label="`${v.version}-${v.bin}`"></el-option>
                </template>
              </el-select>
            </div>
          </template>

          <div class="plant-title">{{ I18nT('host.portSetting') }}</div>
          <div class="main p-5">
            <div class="port-set">
              <div class="port-type">{{ I18nT('host.tcpPort') }}</div>
              <input
                v-model.number="item.projectPort"
                type="number"
                :class="'input' + (errs.projectPort ? ' error' : '')"
                :placeholder="I18nT('host.tcpPort')"
                @change="refreshGeneratedValues"
              />
            </div>
          </div>

          <template v-if="usesConfigFile">
            <div class="plant-title flex items-center justify-between">
              <span>{{ I18nT('setup.module.configPath') }}</span>
              <el-button link :icon="Plus" @click.stop="createConfigFile"></el-button>
            </div>
            <div class="main p-5">
              <div class="path-choose">
                <input
                  v-model.trim="item.roadRunnerConfigPath"
                  type="text"
                  class="input"
                  :placeholder="I18nT('setup.module.configPath')"
                  @change="onConfigPathChange"
                />
                <div class="icon-block" @click="chooseConfigPath">
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

          <div class="plant-title">{{ I18nT('host.runSetting') }}</div>
          <div class="main p-5">
            <textarea
              v-model.trim="item.runCommand"
              style="margin-top: 0"
              :readonly="item.roadRunnerPreset !== 'custom'"
              :class="'input-textarea w-full' + (errs.runCommand ? ' error' : '')"
              :placeholder="I18nT('host.startCommand')"
            ></textarea>
          </div>

          <div class="plant-title">{{ I18nT('host.envVar') }}</div>
          <div class="main p-5">
            <div class="ssl-switch">
              <el-radio-group v-model="item.envVarType">
                <el-radio-button value="none" :label="I18nT('base.none')"></el-radio-button>
                <el-radio-button value="specify" :label="I18nT('host.specifyVar')">
                </el-radio-button>
                <el-radio-button value="file" :label="I18nT('host.fileVar')"></el-radio-button>
              </el-radio-group>
            </div>
            <div v-if="item.envVarType === 'specify'" class="mt-4">
              <textarea
                v-model.trim="item.envVar"
                type="text"
                class="input-textarea w-full"
                style="margin-top: 0"
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
              <div class="icon-block" @click="chooseEnvFile">
                <yb-icon
                  :svg="import('@/svg/folder.svg?raw')"
                  class="choose"
                  width="18"
                  height="18"
                />
              </div>
            </div>
          </div>

          <template v-if="!isWindows">
            <div class="plant-title">{{ I18nT('setup.module.isSudo') }}</div>
            <div class="main p-5">
              <div class="ssl-switch">
                <span>{{ I18nT('setup.module.isSudo') }}</span>
                <el-switch v-model="item.isSudo"></el-switch>
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
  import { computed, onMounted, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { merge } from 'lodash-es'
  import { Plus } from '@element-plus/icons-vue'
  import { dialog, fs } from '@/util/NodeFn'
  import { MessageError } from '@/util/Element'
  import { join } from '@/util/path-browserify'
  import { uuid } from '@/util/Index'
  import { BrewStore } from '@/store/brew'
  import type { ProjectItemType } from '@/components/LanguageProjects/ProjectItem'
  import {
    defaultRoadRunnerConfigPath,
    extractRoadRunnerConfigPort,
    inferRoadRunnerPreset,
    roadRunnerConfigCandidates,
    roadRunnerConfigName,
    roadRunnerFileserverConfig,
    roadRunnerLaravelOctaneCommand,
    roadRunnerPHPWorkerConfig,
    roadRunnerPrimaryConfigPath,
    roadRunnerServeCommand,
    syncRoadRunnerConfigPath,
    updateRoadRunnerConfigPHPCommand,
    updateRoadRunnerConfigPort,
    type RoadRunnerProjectItem,
    type RoadRunnerProjectPreset
  } from './project'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    isEdit: boolean
    edit: Partial<ProjectItemType>
    typeFlag?: string
  }>()

  const presets: Array<{ label: string; value: RoadRunnerProjectPreset }> = [
    { label: 'PHP Worker', value: 'php-worker' },
    { label: 'Existing Config', value: 'existing' },
    { label: 'Laravel Octane', value: 'laravel-octane' },
    { label: 'Fileserver', value: 'fileserver' },
    { label: 'Custom', value: 'custom' }
  ]

  const running = ref(false)
  const isWindows = computed(() => window.Server.isWindows)
  const item = ref<RoadRunnerProjectItem & ProjectItemType>({
    id: uuid(),
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
    runInTerminal: false,
    roadRunnerPreset: 'php-worker',
    roadRunnerConfigPath: '',
    roadRunnerConfigManaged: true,
    roadRunnerPHPBin: '',
    roadRunnerPHPVersion: ''
  })

  const errs = ref({
    comment: false,
    path: false,
    runCommand: false,
    projectPort: false
  })

  merge(item.value, props.edit)
  item.value.isService = true
  item.value.commandType = 'command'
  item.value.roadRunnerPreset = inferRoadRunnerPreset(item.value)
  item.value.roadRunnerConfigPath = roadRunnerPrimaryConfigPath(item.value)
  item.value.roadRunnerConfigManaged =
    item.value.roadRunnerConfigManaged ??
    ['php-worker', 'fileserver'].includes(item.value.roadRunnerPreset)
  syncRoadRunnerConfigPath(item.value)

  const brewStore = BrewStore()
  const roadRunnerVersions = computed(() => {
    return brewStore.module('roadrunner').installed
  })
  const phpVersions = computed(() => {
    return brewStore.module('php').installed.map((p) => {
      return {
        ...p,
        bin: p?.phpBin ?? join(p.path, 'bin/php')
      }
    })
  })

  const needsPHP = computed(() => {
    return ['php-worker', 'laravel-octane'].includes(item.value.roadRunnerPreset)
  })
  const usesConfigFile = computed(() => {
    return ['existing', 'php-worker', 'fileserver'].includes(item.value.roadRunnerPreset)
  })

  const refreshRoadRunnerVersion = () => {
    const find = roadRunnerVersions.value.find((v) => v.bin === item.value.binBin)
    item.value.binVersion = find?.version ?? ''
    item.value.binPath = find?.path ?? ''
  }

  const refreshPHPVersion = () => {
    const find = phpVersions.value.find((v) => v.bin === item.value.roadRunnerPHPBin)
    item.value.roadRunnerPHPVersion = find?.version ?? ''
  }

  const ensureDefaultConfigPath = () => {
    if (!usesConfigFile.value) {
      return
    }
    if (usesConfigFile.value && item.value.path && !item.value.roadRunnerConfigPath) {
      item.value.roadRunnerConfigPath = defaultRoadRunnerConfigPath(item.value.path)
    }
    syncRoadRunnerConfigPath(item.value)
  }

  const refreshGeneratedValues = () => {
    ensureDefaultConfigPath()
    const preset = item.value.roadRunnerPreset
    if (preset === 'laravel-octane') {
      item.value.runCommand = roadRunnerLaravelOctaneCommand(
        item.value.projectPort || 3000,
        item.value.roadRunnerPHPBin
      )
      return
    }
    if (preset !== 'custom') {
      item.value.runCommand = roadRunnerServeCommand(
        item.value.path,
        item.value.roadRunnerConfigPath || ''
      )
    }
  }

  const findExistingConfig = async (projectPath: string) => {
    for (const name of roadRunnerConfigCandidates) {
      const file = join(projectPath, name)
      if (await fs.existsSync(file)) {
        return file
      }
    }
    return ''
  }

  const syncFromConfigFile = async () => {
    const configPath = item.value.roadRunnerConfigPath
    if (!configPath || !(await fs.existsSync(configPath))) {
      return
    }
    const content = await fs.readFile(configPath)
    const port = extractRoadRunnerConfigPort(content)
    if (port) {
      item.value.projectPort = port
    }
    refreshGeneratedValues()
  }

  const applyProjectPath = async (path: string) => {
    item.value.path = path
    const found = await findExistingConfig(path)
    if (found) {
      item.value.roadRunnerConfigPath = found
      if (!props.isEdit) {
        item.value.roadRunnerPreset = 'existing'
        item.value.roadRunnerConfigManaged = false
      }
    } else if (!item.value.roadRunnerConfigPath) {
      item.value.roadRunnerConfigPath = defaultRoadRunnerConfigPath(path)
    }
    await syncFromConfigFile()
    refreshGeneratedValues()
  }

  const onProjectPathChange = () => {
    if (item.value.path) {
      applyProjectPath(item.value.path).catch()
    }
  }

  const chooseProjectPath = () => {
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (!canceled && filePaths.length > 0) {
          applyProjectPath(filePaths[0]).catch()
        }
      })
  }

  const onPresetChange = () => {
    item.value.roadRunnerConfigManaged = ['php-worker', 'fileserver'].includes(
      item.value.roadRunnerPreset
    )
    if (!usesConfigFile.value) {
      const configPath = item.value.roadRunnerConfigPath
      item.value.roadRunnerConfigPath = ''
      item.value.configPath = item.value.configPath.filter((c) => {
        return c.name !== roadRunnerConfigName && c.path !== configPath
      })
    }
    refreshGeneratedValues()
  }

  const onConfigPathChange = () => {
    item.value.roadRunnerConfigManaged = ['php-worker', 'fileserver'].includes(
      item.value.roadRunnerPreset
    )
    syncFromConfigFile()
      .catch()
      .finally(() => {
        refreshGeneratedValues()
      })
  }

  const chooseConfigPath = () => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (!canceled && filePaths.length > 0) {
          item.value.roadRunnerConfigPath = filePaths[0]
          onConfigPathChange()
        }
      })
  }

  const chooseEnvFile = () => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (!canceled && filePaths.length > 0) {
          item.value.envFile = filePaths[0]
        }
      })
  }

  const createConfigFile = async () => {
    ensureDefaultConfigPath()
    const configPath = item.value.roadRunnerConfigPath
    if (!configPath) {
      return
    }
    const exists = await fs.existsSync(configPath)
    if (!exists) {
      if (!['php-worker', 'fileserver'].includes(item.value.roadRunnerPreset)) {
        return
      }
      const content =
        item.value.roadRunnerPreset === 'fileserver'
          ? roadRunnerFileserverConfig(item.value.projectPort || 3000)
          : roadRunnerPHPWorkerConfig(item.value.projectPort || 3000, item.value.roadRunnerPHPBin)
      await fs.writeFile(configPath, content)
      item.value.roadRunnerConfigManaged = true
      return
    }
    const content = await fs.readFile(configPath)
    let next = updateRoadRunnerConfigPort(content, item.value.projectPort || 3000)
    if (item.value.roadRunnerConfigManaged && item.value.roadRunnerPreset === 'php-worker') {
      next = updateRoadRunnerConfigPHPCommand(next, item.value.roadRunnerPHPBin)
    }
    if (next !== content) {
      await fs.writeFile(configPath, next)
    }
  }

  const checkItem = () => {
    errs.value.path = item.value.path.length === 0
    errs.value.runCommand = item.value.runCommand.length === 0
    errs.value.projectPort =
      !Number.isInteger(item.value.projectPort) || item.value.projectPort <= 0
    return !Object.values(errs.value).some(Boolean)
  }

  const doSave = async () => {
    refreshRoadRunnerVersion()
    refreshPHPVersion()
    refreshGeneratedValues()
    if (!checkItem()) {
      return
    }
    running.value = true
    try {
      if (usesConfigFile.value) {
        await createConfigFile()
      }
      item.value.runFile = ''
      item.value.commandType = 'command'
      item.value.isService = true
      if (usesConfigFile.value || item.value.roadRunnerConfigPath) {
        syncRoadRunnerConfigPath(item.value)
      }
      callback(JSON.parse(JSON.stringify(item.value)))
      show.value = false
    } catch (e: any) {
      MessageError(e?.message ?? `${e}`)
    } finally {
      running.value = false
    }
  }

  watch(
    () => item.value.binBin,
    () => {
      refreshRoadRunnerVersion()
    }
  )
  watch(
    () => item.value.roadRunnerPHPBin,
    () => {
      refreshPHPVersion()
      refreshGeneratedValues()
    }
  )
  watch(
    item,
    () => {
      for (const k in errs.value) {
        errs.value[k as keyof typeof errs.value] = false
      }
    },
    { deep: true }
  )

  onMounted(() => {
    syncFromConfigFile().catch()
  })

  refreshRoadRunnerVersion()
  refreshPHPVersion()
  refreshGeneratedValues()

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
