<template>
  <el-drawer
    v-model="show"
    size="520px"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    class="host-edit-drawer"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-edit">
      <!-- nav -->
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">{{ I18nT('flutter.createProjectTitle') }}</span>
        </div>
        <el-button
          type="primary"
          :loading="creating"
          :disabled="creating || !form.name || !form.outputDir"
          @click="doCreate"
        >
          {{ I18nT('flutter.create') }}
        </el-button>
      </div>

      <el-scrollbar class="flex-1">
        <div class="main-wapper p-3">
          <!-- Project Info -->
          <div class="plant-title" style="padding-top: 6px">{{ I18nT('flutter.projectInfo') }}</div>
          <div class="main p-5">
            <div class="mb-4">
              <label class="block text-xs opacity-60 mb-1">{{ I18nT('flutter.projectName') }} <span class="text-red-400">*</span></label>
              <input
                v-model.trim="form.name"
                type="text"
                :class="'input' + (errs.name ? ' error' : '')"
                placeholder="my_flutter_app"
                @input="sanitizeName"
              />
              <div v-if="errs.name" class="text-red-400 text-xs mt-1">{{ errs.name }}</div>
              <div class="text-xs opacity-40 mt-1">{{ I18nT('flutter.lowercaseHint') }}</div>
            </div>

            <div class="mb-4">
              <label class="block text-xs opacity-60 mb-1">{{ I18nT('flutter.organizationOptional') }}</label>
              <input
                v-model.trim="form.orgName"
                type="text"
                class="input"
                placeholder="com.example"
              />
              <div class="text-xs opacity-40 mt-1">Used as the bundle identifier prefix (e.g. com.example).</div>
            </div>

            <div class="mb-4">
              <label class="block text-xs opacity-60 mb-1">{{ I18nT('flutter.outputDirectory') }} <span class="text-red-400">*</span></label>
              <div class="path-choose">
                <input
                  v-model.trim="form.outputDir"
                  type="text"
                  :class="'input' + (errs.outputDir ? ' error' : '')"
                  :placeholder="I18nT('flutter.chooseCreateDir')"
                  readonly
                />
                <div class="icon-block" @click="chooseOutputDir">
                  <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
                </div>
              </div>
              <div v-if="form.outputDir && form.name" class="text-xs opacity-40 mt-1">
                {{ I18nT('flutter.willCreate') }}: {{ form.outputDir }}/{{ form.name || '…' }}
              </div>
            </div>
          </div>

          <!-- Template -->
          <div class="plant-title">{{ I18nT('flutter.projectTemplate') }}</div>
          <div class="main p-5">
            <el-radio-group v-model="form.template" size="small">
              <el-radio-button value="app">App</el-radio-button>
              <el-radio-button value="package">Package</el-radio-button>
              <el-radio-button value="plugin">Plugin</el-radio-button>
              <el-radio-button value="module">Module</el-radio-button>
              <el-radio-button value="skeleton">Skeleton</el-radio-button>
            </el-radio-group>
            <div class="text-xs opacity-40 mt-2">{{ templateDescriptions[form.template] }}</div>
          </div>

          <!-- Flutter Version -->
          <div class="plant-title">{{ I18nT('flutter.flutterVersion') }}</div>
          <div class="main p-5">
            <el-select v-model="form.flutterBin" class="w-full" placeholder="System / PATH flutter">
              <el-option value="" :label="I18nT('flutter.noVersionUsePath')" />
              <el-option
                v-for="v in installedVersions"
                :key="v.bin"
                :value="v.bin"
                :label="`Flutter ${v.version}  —  ${v.bin}`"
              />
            </el-select>
            <div v-if="!installedVersions.length" class="text-xs opacity-40 mt-2">
              {{ I18nT('flutter.noVersionUsePath') }}
            </div>
          </div>

          <div class="plant-title">{{ I18nT('flutter.packageNames') }}</div>
          <div class="main p-5">
            <div class="mb-3">
              <label class="block text-xs opacity-60 mb-1">{{ I18nT('flutter.androidPackage') }}</label>
              <input v-model.trim="form.packageNames.android" type="text" class="input" placeholder="com.example.my_app" />
            </div>
            <div class="mb-3">
              <label class="block text-xs opacity-60 mb-1">{{ I18nT('flutter.iosBundleId') }}</label>
              <input v-model.trim="form.packageNames.ios" type="text" class="input" placeholder="com.example.my_app" />
            </div>
            <div class="mb-3">
              <label class="block text-xs opacity-60 mb-1">{{ I18nT('flutter.webAppName') }}</label>
              <input v-model.trim="form.packageNames.web" type="text" class="input" placeholder="my_app_web" />
            </div>
            <div>
              <label class="block text-xs opacity-60 mb-1">{{ I18nT('flutter.desktopBundleId') }}</label>
              <input v-model.trim="form.packageNames.desktop" type="text" class="input" placeholder="com.example.my_app" />
            </div>
          </div>

          <div class="plant-title">{{ I18nT('flutter.packagesPubdev') }}</div>
          <div class="main p-5">
            <div class="flex items-center gap-2 mb-3">
              <el-input v-model.trim="packageSearch" :placeholder="I18nT('flutter.searchPackagePlaceholder')" />
              <el-button :loading="packageSearching" @click="searchPackages">{{ I18nT('flutter.search') }}</el-button>
            </div>

            <div v-if="packageResults.length" class="fp-packages-list">
              <div v-for="pkg in packageResults" :key="pkg.name" class="fp-package-row">
                <div class="flex-1 min-w-0">
                  <div class="font-medium truncate">{{ pkg.name }}</div>
                  <div class="text-xs opacity-60">{{ I18nT('flutter.latest') }}: {{ pkg.latest || 'unknown' }}</div>
                  <div class="text-xs opacity-50 truncate">{{ pkg.description || I18nT('flutter.noDescription') }}</div>
                </div>
                <el-button size="small" @click="addDependency(pkg, false)">{{ I18nT('flutter.add') }}</el-button>
                <el-button size="small" type="warning" @click="addDependency(pkg, true)">{{ I18nT('flutter.addDev') }}</el-button>
              </div>
            </div>

            <div class="text-xs opacity-60 mb-2 mt-3">{{ I18nT('flutter.selectedDependencies') }}</div>
            <div v-if="!form.dependencies.length" class="text-xs opacity-50">{{ I18nT('flutter.noPackagesSelected') }}</div>
            <div v-else class="flex flex-col gap-2">
              <div v-for="(dep, i) in form.dependencies" :key="`${dep.name}-${i}`" class="fp-selected-row">
                <div class="w-[170px] truncate">{{ dep.name }}</div>
                <el-select v-model="dep.version" filterable class="flex-1" placeholder="version">
                  <el-option v-for="v in dep.versions" :key="v" :value="v" :label="v" />
                </el-select>
                <el-switch v-model="dep.isDev" active-text="dev" inactive-text="prod" />
                <el-button link type="danger" @click="removeDependency(i)">{{ I18nT('flutter.remove') }}</el-button>
              </div>
            </div>

            <div class="ssl-switch mt-4">
              <span>{{ I18nT('flutter.checkUpdatesAfterCreate') }}</span>
              <el-switch v-model="form.checkOutdated" />
            </div>
          </div>

          <div class="plant-title">{{ I18nT('flutter.firebaseFilesByPlatform') }}</div>
          <div class="main p-5">
            <div v-for="k in firebaseKeys" :key="k" class="path-choose mb-3">
              <input v-model.trim="form.firebaseFiles[k]" type="text" class="input" :placeholder="I18nT('flutter.firebaseFileFor') + ' ' + k" readonly />
              <div class="icon-block" @click="chooseFile(form.firebaseFiles, k)">
                <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
              </div>
            </div>
          </div>

          <div class="plant-title">{{ I18nT('flutter.appIconsByPlatform') }}</div>
          <div class="main p-5">
            <div v-for="k in iconKeys" :key="k" class="path-choose mb-3">
              <input v-model.trim="form.appIcons[k]" type="text" class="input" :placeholder="I18nT('flutter.iconFileFor') + ' ' + k" readonly />
              <div class="icon-block" @click="chooseFile(form.appIcons, k)">
                <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
              </div>
            </div>
          </div>

          <!-- Add to Projects toggle -->
          <div class="plant-title">{{ I18nT('flutter.afterCreation') }}</div>
          <div class="main p-5">
            <div class="ssl-switch">
              <span>{{ I18nT('flutter.addToProjectsAuto') }}</span>
              <el-switch v-model="form.addToProjects" />
            </div>
          </div>

          <!-- Output console -->
          <template v-if="output">
            <div class="plant-title">{{ I18nT('flutter.output') }}</div>
            <div class="main">
              <pre class="fp-console">{{ output }}</pre>
            </div>
          </template>
        </div>
      </el-scrollbar>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { reactive, ref, computed } from 'vue'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { dialog } from '@/util/NodeFn'
  import { BrewStore } from '@/store/brew'
  import { AppStore } from '@/store/app'
  import { ProjectSetup } from '@/components/LanguageProjects/setup'
  import { reactiveBind } from '@/util/Index'
  import { ProjectItem } from '@/components/LanguageProjects/ProjectItem'

  const props = defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void
    (e: 'created', projectPath: string): void
  }>()

  const show = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v)
  })

  const appStore = AppStore()
  const brewStore = BrewStore()

  const installedVersions = computed(() =>
    brewStore.module('flutter').installed.map((p) => ({ bin: p.bin, version: p.version, path: p.path }))
  )

  const form = reactive({
    name: '',
    orgName: 'com.example',
    outputDir: '',
    template: 'app' as 'app' | 'package' | 'plugin' | 'module' | 'skeleton',
    flutterBin: '',
    addToProjects: true,
    packageNames: {
      android: '',
      ios: '',
      web: '',
      desktop: ''
    },
    dependencies: [] as Array<{
      name: string
      version: string
      isDev: boolean
      versions: string[]
    }>,
    checkOutdated: true,
    firebaseFiles: {
      android: '',
      ios: '',
      web: '',
      windows: '',
      linux: '',
      macos: ''
    } as Record<string, string>,
    appIcons: {
      android: '',
      ios: '',
      web: '',
      windows: '',
      linux: '',
      macos: ''
    } as Record<string, string>
  })

  const firebaseKeys = ['android', 'ios', 'web', 'windows', 'linux', 'macos']
  const iconKeys = ['android', 'ios', 'web', 'windows', 'linux', 'macos']

  const packageSearch = ref('')
  const packageSearching = ref(false)
  const packageResults = ref<Array<{ name: string; latest: string; description: string }>>([])

  const errs = reactive({ name: '', outputDir: '' })
  const creating = ref(false)
  const output = ref('')

  const templateDescriptions = computed<Record<string, string>>(() => ({
    app: I18nT('flutter.templateAppDesc'),
    package: I18nT('flutter.templatePackageDesc'),
    plugin: I18nT('flutter.templatePluginDesc'),
    module: I18nT('flutter.templateModuleDesc'),
    skeleton: I18nT('flutter.templateSkeletonDesc')
  }))

  const sanitizeName = () => {
    form.name = form.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
  }

  const chooseOutputDir = async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
    })
    if (!canceled && filePaths?.length) {
      form.outputDir = filePaths[0]
    }
  }

  const chooseFile = async (target: Record<string, string>, key: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'showHiddenFiles']
    })
    if (!canceled && filePaths?.length) {
      target[key] = filePaths[0]
    }
  }

  const sendFlutter = (fn: string, ...args: any[]) =>
    new Promise<any>((resolve) => {
      IPC.send('app-fork:flutter', fn, ...args).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          resolve(res?.data ?? {})
          return
        }
        resolve({ ok: false, message: res?.msg ?? 'IPC error' })
      })
    })

  const searchPackages = async () => {
    const q = packageSearch.value.trim()
    if (!q) return
    packageSearching.value = true
    try {
      const res = await sendFlutter('flutterPubDevSearch', q)
      if (!res?.ok) {
        MessageError(res?.message ?? 'Failed to search pub.dev')
        packageResults.value = []
        return
      }
      packageResults.value = Array.isArray(res?.results) ? res.results : []
    } finally {
      packageSearching.value = false
    }
  }

  const addDependency = async (pkg: { name: string; latest: string }, isDev: boolean) => {
    const exists = form.dependencies.find((d) => d.name === pkg.name && d.isDev === isDev)
    if (exists) {
      return
    }
    const dep = {
      name: pkg.name,
      version: pkg.latest || 'any',
      isDev,
      versions: pkg.latest ? [pkg.latest] : []
    }
    form.dependencies.push(dep)

    const versionsRes = await sendFlutter('flutterPubPackageVersions', pkg.name)
    if (versionsRes?.ok && Array.isArray(versionsRes?.versions) && versionsRes.versions.length) {
      dep.versions = versionsRes.versions
      if (!dep.version) {
        dep.version = versionsRes.versions[0]
      }
    }
  }

  const removeDependency = (index: number) => {
    form.dependencies.splice(index, 1)
  }

  const doCreate = async () => {
    errs.name = ''
    errs.outputDir = ''

    if (!form.name) {
      errs.name = I18nT('flutter.projectNameRequired')
      return
    }
    if (!/^[a-z][a-z0-9_]*$/.test(form.name)) {
      errs.name = I18nT('flutter.projectNameRule')
      return
    }
    if (!form.outputDir) {
      errs.outputDir = I18nT('flutter.outputDirRequired')
      return
    }

    creating.value = true
    output.value = `${I18nT('flutter.creatingProject')} "${form.name}"…\n${'─'.repeat(48)}\n`

    const setup = JSON.parse(JSON.stringify(appStore.config.setup))
    const extraConfig = {
      projectName: form.name,
      orgName: form.orgName,
      packageNames: JSON.parse(JSON.stringify(form.packageNames)),
      dependencies: form.dependencies.map((d) => ({
        name: d.name,
        version: d.version,
        isDev: d.isDev
      })),
      checkOutdated: form.checkOutdated,
      firebaseFiles: JSON.parse(JSON.stringify(form.firebaseFiles)),
      appIcons: JSON.parse(JSON.stringify(form.appIcons)),
      flutterBin: form.flutterBin
    }

    IPC.send(
      'app-fork:flutter',
      'flutterCreateProject',
      form.name,
      form.outputDir,
      form.template,
      form.orgName,
      form.flutterBin,
      setup,
      extraConfig
    ).then((key: string, res: any) => {
      IPC.off(key)
      creating.value = false

      if (res?.code !== 0) {
        MessageError(res?.msg ?? 'IPC error')
        output.value += res?.msg ?? 'IPC error'
        return
      }

      const data = res?.data ?? {}
      output.value += data?.output ?? ''

      if (!data?.ok) {
        MessageError(data?.message ?? I18nT('flutter.flutterCreateFailed'))
        return
      }

      MessageSuccess(data?.message ?? I18nT('flutter.projectCreated'))

      if (form.addToProjects && data?.projectPath) {
        const projectStore = ProjectSetup('flutter')
        const selectedVersion = installedVersions.value.find((v) => v.bin === form.flutterBin)
        const newItem = reactiveBind(
          new ProjectItem({
            path: data.projectPath,
            comment: form.name,
            binBin: form.flutterBin || '',
            binVersion: selectedVersion?.version ?? '',
            binPath: selectedVersion?.path ?? '',
            isService: false,
            typeFlag: 'flutter'
          })
        )
        projectStore.project.unshift(newItem)
        projectStore.saveProject()
        projectStore.setDirEnv(newItem).catch()
        if (!projectStore.allDirs.includes(data.projectPath)) {
          projectStore.allDirs.push(data.projectPath)
          projectStore.saveDirs().then(() => projectStore.initDirs())
        }
      }

      emit('created', data?.projectPath ?? '')
      show.value = false
    })
  }

  const closedFn = () => {
    output.value = ''
    errs.name = ''
    errs.outputDir = ''
    packageSearch.value = ''
    packageResults.value = []
  }
</script>

<style lang="scss" scoped>
  .fp-console {
    margin: 0;
    padding: 12px 14px;
    font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
    font-size: 11px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-all;
    background: #1a1a1e;
    color: #cdd6f4;
    border-radius: 0 0 6px 6px;
    max-height: 300px;
    overflow-y: auto;
  }

  .fp-packages-list {
    max-height: 220px;
    overflow: auto;
    border: 1px solid rgba(128, 128, 128, 0.18);
    border-radius: 8px;
  }

  .fp-package-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.12);
  }

  .fp-selected-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
