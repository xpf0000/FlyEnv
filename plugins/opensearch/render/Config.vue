<template>
  <div class="module-config h-full overflow-hidden flex flex-col">
    <el-card class="app-base-el-card flex-1 overflow-hidden">
      <template #header>
        <el-radio-group v-model="current">
          <el-radio-button value="opensearch.yml">opensearch.yml</el-radio-button>
          <el-radio-button value="jvm.options">jvm.options</el-radio-button>
          <el-radio-button value="log4j2.properties">log4j2.properties</el-radio-button>
        </el-radio-group>
      </template>
      <template #default>
        <Conf
          v-if="file"
          :key="current"
          ref="conf"
          :type-flag="'opensearch'"
          :file="file"
          :file-ext="fileExt"
          :config-language="configLanguage"
          :show-commond="current === 'opensearch.yml'"
          :show-load-default="false"
          @on-type-change="onConfTypeChange"
        >
          <template #common>
            <div class="flex items-center gap-3 p-2">
              <el-switch
                :model-value="devMode"
                :disabled="devModeSwitchDisabled"
                @change="onDevModeChange"
              />
              <div class="flex flex-col">
                <span>{{ OpenSearchT('devMode') }}</span>
                <span class="text-xs" style="opacity: 0.6">{{ OpenSearchT('devModeDesc') }}</span>
              </div>
            </div>
          </template>
        </Conf>
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import { I18nT } from '@lang/index'
  import Conf from '@/components/Conf/index.vue'
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'
  import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
  import { OpenSearchManager } from './store'
  import { OpenSearchT } from './lang'

  const brewStore = BrewStore()
  const currentVersion = computed(() => brewStore.currentVersion('opensearch'))

  const current = ref('opensearch.yml')
  const conf = ref()
  const confDir = ref('')

  const fileExtMap: Record<string, string> = {
    'opensearch.yml': 'yml',
    'jvm.options': 'options',
    'log4j2.properties': 'properties'
  }
  const fileExt = computed(() => fileExtMap[current.value] ?? 'txt')
  const configLanguage = computed(() => (current.value === 'opensearch.yml' ? 'yaml' : undefined))

  // Homebrew installs keep config under <path>/libexec/config (a symlink into
  // /opt/homebrew/etc/opensearch); tarball installs use <path>/config.
  const resolveConfDir = async () => {
    const path = currentVersion.value?.path
    if (!path) {
      confDir.value = ''
      return
    }
    const brewConf = join(path, 'libexec', 'config', current.value)
    const isBrew = await fs.existsSync(brewConf).catch(() => false)
    confDir.value = isBrew ? join(path, 'libexec', 'config') : join(path, 'config')
  }

  watch([() => currentVersion.value?.path, current], () => resolveConfDir().catch(), {
    immediate: true
  })

  const file = computed(() => (confDir.value ? join(confDir.value, current.value) : ''))

  OpenSearchManager.init().catch()

  const devMode = computed(() => OpenSearchManager.devMode(currentVersion.value?.path))
  const devModeSwitchDisabled = computed(
    () => !currentVersion.value?.path || OpenSearchManager.applying(currentVersion.value?.path)
  )

  const refreshDevModeState = () => {
    const version = currentVersion.value
    if (version?.path) {
      OpenSearchManager.fetchDevModeState(JSON.parse(JSON.stringify(version))).catch()
    }
  }

  watch(() => currentVersion.value?.path, refreshDevModeState, { immediate: true })

  const onConfTypeChange = () => {
    refreshDevModeState()
  }

  const onDevModeChange = async (enable: boolean) => {
    const version = currentVersion.value
    if (!version?.path) {
      MessageError(OpenSearchT('devModeNoVersion'))
      return
    }
    try {
      await OpenSearchManager.applyDevMode(JSON.parse(JSON.stringify(version)), enable)
    } catch (e: any) {
      MessageError(e?.message ?? I18nT('base.fail'))
      return
    }
    conf.value?.update?.()
    if (!enable) {
      MessageWarning(OpenSearchT('devModeDisableAdminTip'))
    }
    MessageSuccess(OpenSearchT('devModeRestartTip'))
    if (version.run || version.running) {
      ElMessageBox.confirm(OpenSearchT('devModeRestartTip'), OpenSearchT('devMode'), {
        confirmButtonText: OpenSearchT('devModeRestartNow'),
        cancelButtonText: I18nT('base.cancel'),
        type: 'warning'
      })
        .then(() => {
          version.restart().catch()
        })
        .catch()
    }
  }
</script>
