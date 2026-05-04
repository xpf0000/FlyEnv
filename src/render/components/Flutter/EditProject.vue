<template>
  <el-drawer
    v-model="show"
    size="620px"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    class="host-edit-drawer"
    :with-header="false"
    @opened="onOpened"
  >
    <div class="host-edit">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">{{ I18nT('flutter.flutterProjectSettings') }}</span>
        </div>
        <el-button :disabled="saving || !projectPath" @click="showPreview = true">{{ I18nT('flutter.preview') }}</el-button>
        <el-button type="primary" :loading="saving" :disabled="saving || !projectPath" @click="doSave">
          {{ I18nT('flutter.save') }}
        </el-button>
      </div>

      <el-dialog
        v-model="showPreview"
        :title="I18nT('flutter.previewChanges')"
        width="620px"
        :append-to-body="true"
      >
        <pre class="fp-console fp-preview">{{ previewContent }}</pre>
      </el-dialog>

      <el-scrollbar class="flex-1">
        <div class="main-wapper p-3">
          <div class="plant-title" style="padding-top: 6px">{{ I18nT('flutter.projectTarget') }}</div>
          <div class="main p-5">
            <input v-model.trim="projectPath" type="text" class="input" readonly />
          </div>

          <div class="plant-title">{{ I18nT('flutter.projectIdentity') }}</div>
          <div class="main p-5">
            <div class="mb-3">
              <label class="block text-xs opacity-60 mb-1">{{ I18nT('flutter.projectName') }}</label>
              <input v-model.trim="form.projectName" type="text" class="input" placeholder="my_flutter_app" @input="sanitizeName" />
            </div>
            <div>
              <label class="block text-xs opacity-60 mb-1">{{ I18nT('flutter.organizationOptional') }}</label>
              <input v-model.trim="form.orgName" type="text" class="input" placeholder="com.example" />
            </div>
          </div>

          <div class="plant-title">{{ I18nT('flutter.flutterVersion') }}</div>
          <div class="main p-5">
            <el-select v-model="form.flutterBin" class="w-full" :placeholder="I18nT('flutter.noVersionUsePath')">
              <el-option value="" :label="I18nT('flutter.noVersionUsePath')" />
              <el-option
                v-for="v in installedVersions"
                :key="v.bin"
                :value="v.bin"
                :label="`Flutter ${v.version}  —  ${v.bin}`"
              />
            </el-select>
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
              <el-button :loading="loadingPackages" @click="refreshPackages">{{ I18nT('flutter.refreshInstalled') }}</el-button>
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
            <div v-if="!form.dependencies.length" class="text-xs opacity-50">{{ I18nT('flutter.noPackagesInPubspec') }}</div>
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
              <span>{{ I18nT('flutter.checkUpdatesOnSave') }}</span>
              <el-switch v-model="form.checkOutdated" />
            </div>

            <template v-if="outdated.length">
              <div class="text-xs opacity-60 mt-4 mb-2">{{ I18nT('flutter.outdatedPackages') }}</div>
              <el-table :data="outdated" size="small" style="width: 100%">
                <el-table-column prop="package" :label="I18nT('flutter.package')" min-width="120" />
                <el-table-column prop="current" :label="I18nT('flutter.current')" width="110" />
                <el-table-column prop="latest" :label="I18nT('flutter.latest')" width="110" />
                <el-table-column prop="upgradable" :label="I18nT('flutter.upgradable')" width="110" />
              </el-table>
            </template>
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
  import { computed, reactive, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { AppStore } from '@/store/app'
  import { dialog } from '@/util/NodeFn'
  import { BrewStore } from '@/store/brew'
  import { ProjectSetup } from '@/components/LanguageProjects/setup'

  const props = defineProps<{ modelValue: boolean; projectPath: string }>()
  const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

  const show = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v)
  })

  const appStore = AppStore()
  const brewStore = BrewStore()

  const installedVersions = computed(() =>
    brewStore.module('flutter').installed.map((p) => ({ bin: p.bin, version: p.version, path: p.path }))
  )

  const projectPath = ref('')
  const output = ref('')
  const saving = ref(false)
  const loadingPackages = ref(false)

  const firebaseKeys = ['android', 'ios', 'web', 'windows', 'linux', 'macos']
  const iconKeys = ['android', 'ios', 'web', 'windows', 'linux', 'macos']

  const form = reactive({
    projectName: '',
    orgName: 'com.example',
    flutterBin: '',
    packageNames: {
      android: '',
      ios: '',
      web: '',
      desktop: ''
    },
    dependencies: [] as Array<{ name: string; version: string; isDev: boolean; versions: string[] }>,
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

  const outdated = ref<Array<{ package: string; current: string; latest: string; upgradable: string }>>([])

  const packageSearch = ref('')
  const packageSearching = ref(false)
  const packageResults = ref<Array<{ name: string; latest: string; description: string }>>([])
  const showPreview = ref(false)

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

  const sanitizeName = () => {
    form.projectName = form.projectName.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
  }

  const chooseFile = async (target: Record<string, string>, key: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'showHiddenFiles']
    })
    if (!canceled && filePaths?.length) {
      target[key] = filePaths[0]
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

  const refreshPackages = async () => {
    if (!projectPath.value) return
    loadingPackages.value = true
    try {
      const setup = JSON.parse(JSON.stringify(appStore.config.setup))
      const res = await sendFlutter('flutterProjectPackages', projectPath.value, setup)
      if (!res?.ok) {
        MessageError(res?.message ?? 'Failed to read pubspec packages')
        return
      }
      const deps = Array.isArray(res?.dependencies) ? res.dependencies : []
      const devDeps = Array.isArray(res?.devDependencies) ? res.devDependencies : []
      form.dependencies = [
        ...deps.map((d: any) => ({ name: d.name, version: d.version, isDev: false, versions: [d.version].filter(Boolean) })),
        ...devDeps.map((d: any) => ({ name: d.name, version: d.version, isDev: true, versions: [d.version].filter(Boolean) }))
      ]
      outdated.value = Array.isArray(res?.outdated) ? res.outdated : []
    } finally {
      loadingPackages.value = false
    }
  }

  const onOpened = async () => {
    projectPath.value = props.projectPath || ''
    output.value = ''
    packageResults.value = []
    packageSearch.value = ''
    if (!projectPath.value) {
      return
    }

    const setup = JSON.parse(JSON.stringify(appStore.config.setup))
    const res = await sendFlutter('flutterReadProjectConfig', projectPath.value, setup)
    if (!res?.ok) {
      MessageError(res?.message ?? 'Failed to read project config')
      return
    }

    form.projectName = res?.projectName || ''
    form.orgName = res?.orgName || 'com.example'
    form.packageNames.android = res?.packageNames?.android || ''
    form.packageNames.ios = res?.packageNames?.ios || ''
    form.packageNames.web = res?.packageNames?.web || ''
    form.packageNames.desktop = res?.packageNames?.desktop || ''

    const deps = Array.isArray(res?.dependencies) ? res.dependencies : []
    const devDeps = Array.isArray(res?.devDependencies) ? res.devDependencies : []
    form.dependencies = [
      ...deps.map((d: any) => ({ name: d.name, version: d.version, isDev: false, versions: [d.version].filter(Boolean) })),
      ...devDeps.map((d: any) => ({ name: d.name, version: d.version, isDev: true, versions: [d.version].filter(Boolean) }))
    ]
    outdated.value = Array.isArray(res?.outdated) ? res.outdated : []
  }

  const doSave = async () => {
    if (!projectPath.value) {
      MessageError(I18nT('flutter.projectPathRequired'))
      return
    }

    saving.value = true
    output.value = `${I18nT('flutter.applyingSettings')}...\n`

    const setup = JSON.parse(JSON.stringify(appStore.config.setup))
    const payload = {
      projectName: form.projectName,
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

    try {
      const res = await sendFlutter('flutterApplyProjectConfig', projectPath.value, payload, setup)
      if (!res?.ok) {
        MessageError(res?.message ?? I18nT('flutter.saveFailed'))
        output.value += res?.message ?? I18nT('flutter.saveFailed')
        return
      }

      output.value += `${res?.output ?? ''}`
      if (Array.isArray(res?.warnings) && res.warnings.length) {
        output.value += `\nWarnings:\n- ${res.warnings.join('\n- ')}`
      }

      outdated.value = Array.isArray(res?.outdated) ? res.outdated : outdated.value

      const projectStore = ProjectSetup('flutter')
      const find = projectStore.project.find((p) => p.path === projectPath.value)
      if (find) {
        const selectedVersion = installedVersions.value.find((v) => v.bin === form.flutterBin)
        find.binBin = form.flutterBin || ''
        find.binVersion = selectedVersion?.version ?? ''
        find.binPath = selectedVersion?.path ?? ''
        projectStore.saveProject()
        projectStore.setDirEnv(find).catch()
      }

      MessageSuccess(I18nT('flutter.saveSuccess'))
      show.value = false
    } finally {
      saving.value = false
    }
  }

  const previewContent = computed(() => {
    return JSON.stringify(
      {
        projectPath: projectPath.value,
        projectName: form.projectName,
        orgName: form.orgName,
        flutterBin: form.flutterBin,
        packageNames: form.packageNames,
        dependencies: form.dependencies.map((d) => ({
          name: d.name,
          version: d.version,
          isDev: d.isDev
        })),
        checkOutdated: form.checkOutdated,
        firebaseFiles: Object.fromEntries(Object.entries(form.firebaseFiles).filter(([, v]) => !!v)),
        appIcons: Object.fromEntries(Object.entries(form.appIcons).filter(([, v]) => !!v))
      },
      null,
      2
    )
  })
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

  .fp-preview {
    max-height: 420px;
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
