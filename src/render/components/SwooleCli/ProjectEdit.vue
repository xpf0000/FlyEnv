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
          <span class="ml-3">{{ isEdit ? I18nT('common.action.edit') : I18nT('common.action.add') }}</span>
        </div>
        <el-button :loading="running" :disabled="running" class="shrink0" @click="doSave">
          {{ I18nT('common.action.save') }}
        </el-button>
      </div>

      <el-scrollbar class="flex-1">
        <div class="main-wapper p-3">
          <div class="plant-title" style="padding-top: 6px">{{
            I18nT('common.category.basicInfo')
          }}</div>
          <div class="main p-5">
            <input
              v-model.trim="item.comment"
              type="text"
              :class="'input mb-4' + (errs.comment ? ' error' : '')"
              :placeholder="I18nT('common.label.comment')"
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

          <div class="plant-title">Swoole CLI</div>
          <div class="main p-5">
            <el-select
              v-model="item.binBin"
              class="w-full mb-4"
              :placeholder="I18nT('base.selectVersion')"
            >
              <el-option :value="''" :label="I18nT('host.useSysVersion')"></el-option>
              <template v-for="(v, _i) in swooleCliVersions" :key="_i">
                <el-option :value="v.bin" :label="`${v.version}-${v.bin}`"></el-option>
              </template>
            </el-select>

            <el-radio-group
              v-model="item.swooleCliPreset"
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

          <template v-if="needsScript">
            <div class="plant-title">PHP Script</div>
            <div class="main p-5">
              <div class="path-choose">
                <input
                  v-model.trim="item.swooleCliScriptPath"
                  type="text"
                  :class="'input' + (errs.swooleCliScriptPath ? ' error' : '')"
                  placeholder="server.php"
                  @change="onScriptPathChange"
                />
                <div class="icon-block" @click="chooseScriptPath">
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

          <div class="plant-title">{{ I18nT('host.runSetting') }}</div>
          <div class="main p-5">
            <textarea
              v-model.trim="item.runCommand"
              style="margin-top: 0"
              :readonly="item.swooleCliPreset !== 'custom'"
              :class="'input-textarea w-full' + (errs.runCommand ? ' error' : '')"
              :placeholder="I18nT('common.label.startCommand')"
            ></textarea>
          </div>

          <div class="plant-title">{{ I18nT('host.envVar') }}</div>
          <div class="main p-5">
            <div class="ssl-switch">
              <el-radio-group v-model="item.envVarType">
                <el-radio-button value="none" :label="I18nT('common.value.none')"></el-radio-button>
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
  import { computed, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { merge } from 'lodash-es'
  import { Delete, Plus } from '@element-plus/icons-vue'
  import { dialog, fs } from '@/util/NodeFn'
  import { MessageError } from '@/util/Element'
  import { basename, join } from '@/util/path-browserify'
  import { uuid } from '@/util/Index'
  import { BrewStore } from '@/store/brew'
  import type { AllAppModule } from '@/core/type'
  import type { ProjectItemType } from '@/components/LanguageProjects/ProjectItem'
  import {
    defaultSwooleCliScriptPath,
    inferSwooleCliPreset,
    swooleCliKnownConfigPaths,
    swooleCliPresetCommand,
    type SwooleCliProjectItem,
    type SwooleCliProjectPreset
  } from './project'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    isEdit: boolean
    edit: Partial<ProjectItemType>
    typeFlag?: AllAppModule
  }>()

  const presets: Array<{ label: string; value: SwooleCliProjectPreset }> = [
    { label: 'Native Swoole', value: 'native' },
    { label: 'Hyperf', value: 'hyperf' },
    { label: 'EasySwoole', value: 'easyswoole' },
    { label: 'Laravel Octane', value: 'laravel-octane' },
    { label: 'PHP Script', value: 'php-script' },
    { label: 'Custom', value: 'custom' }
  ]

  const running = ref(false)
  const isWindows = computed(() => window.Server.isWindows)
  const item = ref<SwooleCliProjectItem & ProjectItemType>({
    id: uuid(),
    typeFlag: props.typeFlag ?? 'swoole-cli',
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
    swooleCliPreset: 'native',
    swooleCliScriptPath: ''
  })

  const errs = ref({
    comment: false,
    path: false,
    runCommand: false,
    projectPort: false,
    swooleCliScriptPath: false
  })

  merge(item.value, props.edit)
  item.value.isService = true
  item.value.commandType = 'command'
  item.value.swooleCliPreset = inferSwooleCliPreset(item.value)
  if (!item.value.swooleCliScriptPath && item.value.path) {
    item.value.swooleCliScriptPath = defaultSwooleCliScriptPath(item.value.path)
  }

  const brewStore = BrewStore()
  const swooleCliVersions = computed(() => {
    return brewStore
      .module('swoole-cli')
      .installed.filter((p) => p.version && p.bin && p.enable !== false)
  })
  const needsScript = computed(() => {
    return ['native', 'php-script'].includes(`${item.value.swooleCliPreset}`)
  })

  const refreshSwooleCliVersion = () => {
    const find = swooleCliVersions.value.find((v) => v.bin === item.value.binBin)
    item.value.binVersion = find?.version ?? ''
    item.value.binPath = find?.path ?? ''
  }

  const refreshGeneratedValues = () => {
    if (!item.value.swooleCliScriptPath && item.value.path && needsScript.value) {
      item.value.swooleCliScriptPath = defaultSwooleCliScriptPath(item.value.path)
    }
    const preset = item.value.swooleCliPreset || 'native'
    if (preset !== 'custom') {
      item.value.runCommand = swooleCliPresetCommand(
        preset,
        item.value.path,
        item.value.projectPort || 3000,
        item.value.swooleCliScriptPath
      )
    }
  }

  const detectPreset = async (projectPath: string): Promise<SwooleCliProjectPreset> => {
    if (await fs.existsSync(join(projectPath, 'bin/hyperf.php'))) {
      return 'hyperf'
    }
    if (await fs.existsSync(join(projectPath, 'artisan'))) {
      return 'laravel-octane'
    }
    if (await fs.existsSync(join(projectPath, 'easyswoole'))) {
      return 'easyswoole'
    }
    if (await fs.existsSync(join(projectPath, 'server.php'))) {
      return 'native'
    }
    return item.value.swooleCliPreset || 'native'
  }

  const syncConfigPaths = async () => {
    const candidates = swooleCliKnownConfigPaths(
      item.value.swooleCliPreset || 'native',
      item.value.path,
      item.value.swooleCliScriptPath
    )
    for (const candidate of candidates) {
      if (
        candidate.path &&
        (await fs.existsSync(candidate.path)) &&
        !item.value.configPath.some((c) => c.path === candidate.path)
      ) {
        item.value.configPath.push(candidate)
      }
    }
  }

  const applyProjectPath = async (path: string) => {
    item.value.path = path
    if (!props.isEdit) {
      item.value.swooleCliPreset = await detectPreset(path)
    }
    if (!item.value.swooleCliScriptPath || !props.isEdit) {
      item.value.swooleCliScriptPath = defaultSwooleCliScriptPath(path)
    }
    refreshGeneratedValues()
    await syncConfigPaths()
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

  const chooseScriptPath = () => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (!canceled && filePaths.length > 0) {
          item.value.swooleCliScriptPath = filePaths[0]
          if (!item.value.path) {
            item.value.path = filePaths[0].replace(/[/\\][^/\\]+$/, '')
          }
          refreshGeneratedValues()
          syncConfigPaths().catch()
        }
      })
  }

  const onScriptPathChange = () => {
    refreshGeneratedValues()
    syncConfigPaths().catch()
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

  const addConfigPath = () => {
    item.value.configPath.push({ name: '', path: '' })
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

  const onPresetChange = () => {
    refreshGeneratedValues()
    syncConfigPaths().catch()
  }

  const checkItem = () => {
    errs.value.path = item.value.path.length === 0
    errs.value.runCommand = item.value.runCommand.length === 0
    errs.value.projectPort =
      !Number.isInteger(item.value.projectPort) || item.value.projectPort <= 0
    errs.value.swooleCliScriptPath =
      needsScript.value && (item.value.swooleCliScriptPath?.length ?? 0) === 0
    return !Object.values(errs.value).some(Boolean)
  }

  const doSave = async () => {
    refreshSwooleCliVersion()
    refreshGeneratedValues()
    if (!checkItem()) {
      return
    }
    running.value = true
    try {
      await syncConfigPaths()
      item.value.runFile = ''
      item.value.commandType = 'command'
      item.value.isService = true
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
      refreshSwooleCliVersion()
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

  refreshSwooleCliVersion()
  refreshGeneratedValues()
  syncConfigPaths().catch()

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
