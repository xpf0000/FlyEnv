<template>
  <el-dialog
    :model-value="true"
    width="780px"
    class="module-onboarding-dialog"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
  >
    <template #header="{ titleId, titleClass }">
      <div class="module-onboarding-header">
        <h2 :id="titleId" :class="titleClass">
          {{ I18nT('setup.moduleOnboarding.title') }}
        </h2>
        <p>{{ I18nT('setup.moduleOnboarding.description') }}</p>
      </div>
    </template>

    <div class="module-onboarding-grid">
      <button
        v-for="preset in MODULE_STACK_PRESETS"
        :key="preset.id"
        type="button"
        class="module-onboarding-card"
        :class="{ 'is-selected': selected.includes(preset.id) }"
        :aria-pressed="selected.includes(preset.id)"
        :disabled="saving"
        @click="togglePreset(preset.id)"
      >
        <yb-icon :svg="presetIcons[preset.icon]" width="38" height="38" />
        <span class="module-onboarding-card-copy">
          <strong>{{ preset.label }}</strong>
          <span>{{ visiblePresetModules(preset.modules) }}</span>
        </span>
      </button>
    </div>

    <div class="module-onboarding-count">
      {{ I18nT('setup.moduleOnboarding.selectedCount', { count: selectedModuleCount }) }}
    </div>

    <template #footer>
      <div class="module-onboarding-actions">
        <el-button link :disabled="saving" @click="showAll">
          {{ I18nT('setup.moduleOnboarding.showAll') }}
        </el-button>
        <div class="module-onboarding-actions-primary">
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
  import phpIcon from '@/svg/php.svg?raw'
  import nodeIcon from '@/svg/nodejs.svg?raw'
  import javaIcon from '@/svg/java.svg?raw'
  import pythonIcon from '@/svg/python.svg?raw'
  import goIcon from '@/svg/Golang.svg?raw'
  import dotnetIcon from '@/svg/dotnet.svg?raw'
  import rubyIcon from '@/svg/Ruby.svg?raw'
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

<style lang="scss" scoped>
  .module-onboarding-header {
    padding-right: 8px;

    h2 {
      margin: 0;
      color: var(--el-text-color-primary);
      font-size: 20px;
      font-weight: 600;
      line-height: 1.35;
    }

    p {
      margin: 8px 0 0;
      color: var(--el-text-color-secondary);
      font-size: 14px;
      line-height: 1.55;
    }
  }

  .module-onboarding-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .module-onboarding-card {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 14px;
    padding: 15px 16px;
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    background: var(--el-fill-color-blank);
    color: var(--el-text-color-primary);
    font: inherit;
    text-align: left;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease,
      box-shadow 0.15s ease;
    cursor: pointer;

    &:hover:not(:disabled) {
      border-color: var(--el-border-color-darker);
    }

    &:focus-visible {
      outline: 2px solid #eab308;
      outline-offset: 2px;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.7;
    }

    &.is-selected {
      border-color: #eab308;
      background: rgb(234 179 8 / 10%);
      box-shadow: 0 0 0 1px rgb(234 179 8 / 20%);
    }

    .fa-icon {
      flex: none;
    }
  }

  .module-onboarding-card-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5px;

    strong {
      font-size: 15px;
      font-weight: 600;
      line-height: 1.3;
    }

    span {
      color: var(--el-text-color-secondary);
      font-size: 12px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
  }

  .module-onboarding-count {
    margin-top: 16px;
    color: var(--el-text-color-regular);
    font-size: 13px;
  }

  .module-onboarding-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .module-onboarding-actions-primary {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  @media (max-width: 640px) {
    .module-onboarding-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .module-onboarding-actions {
      align-items: stretch;
      flex-direction: column-reverse;
    }

    .module-onboarding-actions-primary {
      justify-content: flex-end;
    }
  }
</style>

<style lang="scss">
  .module-onboarding-dialog {
    max-width: calc(100vw - 32px);

    .el-dialog__body {
      max-height: calc(100vh - 190px);
      overflow-y: auto;
    }
  }
</style>
