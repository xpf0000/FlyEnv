<template>
  <el-dialog
    :model-value="true"
    width="780px"
    class="dark:bg-[#1d2033] el-dialog-content-flex-1 h-[600px] max-h-[75vh]"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
  >
    <template #header="{ titleId, titleClass }">
      <div class="pr-2">
        <h2
          :id="titleId"
          :class="[
            titleClass,
            'm-0 text-xl font-semibold leading-[1.35] text-[var(--el-text-color-primary)]'
          ]"
        >
          {{ I18nT('setup.moduleOnboarding.title') }}
        </h2>
        <p class="m-0 mt-2 text-sm leading-[1.55] text-[var(--el-text-color-secondary)]">
          {{ I18nT('setup.moduleOnboarding.description') }}
        </p>
      </div>
    </template>

    <el-auto-resizer class="h-full overflow-hidden">
      <template #default="{ height }">
        <el-scrollbar :height="height">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              v-for="preset in MODULE_STACK_PRESETS"
              :key="preset.id"
              type="button"
              class="flex h-[91px] min-w-0 cursor-pointer items-center gap-3.5 rounded-lg border px-4 py-[15px] text-left font-[inherit] text-[var(--el-text-color-primary)] transition-[border-color,background-color,box-shadow] duration-150 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              :class="
                selected.includes(preset.id)
                  ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgb(59_130_246/0.2)] enabled:hover:border-blue-500'
                  : 'border-[var(--el-border-color)] bg-[var(--el-fill-color-blank)] enabled:hover:border-[var(--el-border-color-darker)]'
              "
              :aria-pressed="selected.includes(preset.id)"
              :disabled="saving"
              @click="togglePreset(preset.id)"
            >
              <yb-icon
                :class="{ 'p-[3px]': preset.icon === 'ruby', 'p-[2px]': preset.icon === 'rust' }"
                :svg="presetIcons[preset.icon]"
                width="38"
                height="38"
                class="shrink-0"
              />
              <span class="flex min-w-0 flex-col gap-[5px]">
                <strong class="text-[15px] font-semibold leading-[1.3]">{{ preset.label }}</strong>
                <span
                  class="text-xs leading-[1.45] text-[var(--el-text-color-secondary)] [overflow-wrap:anywhere]"
                  >{{ visiblePresetModules(preset.modules) }}</span
                >
              </span>
            </button>
          </div>

          <div
            class="mt-4 text-[13px] text-[var(--el-text-color-regular)]"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {{ I18nT('setup.moduleOnboarding.selectedCount', { count: selectedModuleCount }) }}
          </div>
        </el-scrollbar>
      </template>
    </el-auto-resizer>

    <template #footer>
      <div
        class="flex items-center justify-between gap-4 max-sm:flex-col-reverse max-sm:items-stretch"
      >
        <el-button link :disabled="saving" @click="showAll">
          {{ I18nT('setup.moduleOnboarding.showAll') }}
        </el-button>
        <div class="flex items-center gap-2 max-sm:justify-end">
          <el-button :disabled="saving" @click="customize">
            {{ I18nT('setup.moduleOnboarding.customize') }}
          </el-button>
          <el-button type="primary" :disabled="saving" :loading="saving" @click="apply">
            {{ I18nT('setup.moduleOnboarding.apply') }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import type { AllAppModule } from '@/core/type'
  import { AppStore } from '@/store/app'
  import { MessageError } from '@/util/Element'
  import { app } from '@/util/NodeFn'
  import phpIcon from '@/svg/php-raw.svg?raw'
  import nodeIcon from '@/svg/nodejs-raw.svg?raw'
  import javaIcon from '@/svg/java-raw.svg?raw'
  import pythonIcon from '@/svg/python-raw.svg?raw'
  import goIcon from '@/svg/golang-raw.svg?raw'
  import dotnetIcon from '@/svg/dotnet-raw.svg?raw'
  import rubyIcon from '@/svg/ruby-raw.svg?raw'
  import rustIcon from '@/svg/rust.svg?raw'
  import { persistModuleOnboarding } from './persistence'
  import {
    buildAllVisible,
    buildPresetVisibility,
    MODULE_STACK_PRESETS,
    type ModuleStackPresetId,
    type ModuleVisibilityMap
  } from './presets'

  const props = defineProps<{
    supportedFlags: readonly AllAppModule[]
  }>()

  const emit = defineEmits<{
    resolved: [destination: 'main' | 'module-settings']
  }>()

  const appStore = AppStore()
  const selected = ref<ModuleStackPresetId[]>(['php'])
  const saving = ref(false)

  const presetIcons = {
    php: phpIcon,
    node: nodeIcon,
    java: javaIcon,
    python: pythonIcon,
    go: goIcon,
    dotnet: dotnetIcon,
    ruby: rubyIcon,
    rust: rustIcon
  } satisfies Record<ModuleStackPresetId, string>

  const moduleLabels: Partial<Record<AllAppModule, string>> = {
    php: 'PHP',
    'php-fpm': 'PHP-FPM',
    apache: 'Apache',
    nginx: 'Nginx',
    node: 'Node.js',
    mysql: 'MySQL',
    mariadb: 'MariaDB',
    redis: 'Redis',
    postgresql: 'PostgreSQL',
    mongodb: 'MongoDB',
    java: 'Java',
    gradle: 'Gradle',
    tomcat: 'Tomcat',
    python: 'Python',
    golang: 'Go',
    dotnet: '.NET',
    ruby: 'Ruby',
    rust: 'Rust'
  }

  const currentVisibility = computed(() => appStore.config.setup.common.showItem)
  const previewVisibility = computed(() =>
    buildPresetVisibility(currentVisibility.value, props.supportedFlags, selected.value)
  )
  const selectedModuleCount = computed(
    () => props.supportedFlags.filter((flag) => previewVisibility.value[flag] !== false).length
  )

  const visiblePresetModules = (modules: readonly AllAppModule[]) =>
    modules
      .filter((flag) => props.supportedFlags.includes(flag))
      .map((flag) => moduleLabels[flag] ?? flag)
      .join(', ')

  const togglePreset = (id: ModuleStackPresetId) => {
    selected.value = selected.value.includes(id)
      ? selected.value.filter((item) => item !== id)
      : [...selected.value, id]
  }

  const run = async (
    destination: 'main' | 'module-settings',
    nextVisibility: ModuleVisibilityMap | undefined
  ) => {
    if (saving.value) return
    saving.value = true
    try {
      await persistModuleOnboarding(appStore.config, nextVisibility, app.completeModuleOnboarding)
      emit('resolved', destination)
    } catch {
      MessageError(I18nT('setup.moduleOnboarding.saveFailed'))
    } finally {
      saving.value = false
    }
  }

  const apply = () =>
    run(
      'main',
      buildPresetVisibility(currentVisibility.value, props.supportedFlags, selected.value)
    )

  const showAll = () => run('main', buildAllVisible(currentVisibility.value, props.supportedFlags))

  const customize = () => run('module-settings', undefined)
</script>
