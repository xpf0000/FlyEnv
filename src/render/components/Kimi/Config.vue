<template>
  <div class="module-config h-full overflow-hidden flex flex-col">
    <el-card class="app-base-el-card flex-1 overflow-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <el-radio-group v-model="filepath">
            <template v-for="(item, _index) in configs" :key="_index">
              <el-radio-button :value="item.path" :label="item.name"></el-radio-button>
            </template>
          </el-radio-group>
          <el-button link :disabled="KimiSetup.loading" @click="KimiSetup.init()">
            <yb-icon
              :svg="import('@/svg/icon_refresh.svg?raw')"
              class="refresh-icon"
              :class="{ 'fa-spin': KimiSetup.loading }"
            ></yb-icon>
          </el-button>
        </div>
      </template>
      <template #default>
        <div v-if="filepath === configTomlPath" class="quick-settings mb-4 p-4 border-b border-gray-200 dark:border-gray-700">
          <div class="text-sm font-medium mb-3">{{ I18nT('kimi.quickSettings') }}</div>
          <div class="flex flex-wrap gap-4 items-center">
            <el-form-item :label="I18nT('kimi.permissionMode')" class="mb-0">
              <el-select v-model="KimiSetup.quickSettings.default_permission_mode" style="width: 140px" @change="saveQuickSettings">
                <el-option label="manual" value="manual" />
                <el-option label="auto" value="auto" />
                <el-option label="yolo" value="yolo" />
              </el-select>
            </el-form-item>
            <el-form-item :label="I18nT('kimi.defaultThinking')" class="mb-0">
              <el-switch v-model="KimiSetup.quickSettings.default_thinking" @change="saveQuickSettings" />
            </el-form-item>
            <el-form-item :label="I18nT('kimi.defaultPlanMode')" class="mb-0">
              <el-switch v-model="KimiSetup.quickSettings.default_plan_mode" @change="saveQuickSettings" />
            </el-form-item>
            <el-form-item :label="I18nT('kimi.telemetry')" class="mb-0">
              <el-switch v-model="KimiSetup.quickSettings.telemetry" @change="saveQuickSettings" />
            </el-form-item>
          </div>
        </div>
        <ConfVM
          :key="filepath"
          ref="conf"
          class="h-full overflow-hidden"
          :type-flag="'kimi'"
          :show-load-default="false"
          :file="filepath"
          :file-ext="fileExt"
          :config-language="configLanguage"
          :show-commond="false"
        >
        </ConfVM>
      </template>
      <template #footer>
        <ToolVM v-if="conf" :conf="conf"></ToolVM>
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import ConfVM from '@/components/Conf/conf.vue'
  import ToolVM from '@/components/Conf/tool.vue'
  import { KimiSetup } from '@/components/Kimi/setup'
  import { I18nT } from '@lang/index'

  const conf = ref()

  const configs = computed(() => {
    return Object.entries(KimiSetup.configPaths).map(([name, path]) => ({ name, path }))
  })

  const filepath = computed({
    get() {
      return KimiSetup.confTab
    },
    set(value) {
      KimiSetup.confTab = value
    }
  })

  const configTomlPath = computed(() => KimiSetup.configPaths['config.toml'])

  watch(
    configs,
    (val) => {
      if (val.length > 0 && !filepath.value) {
        filepath.value = val[0].path
      }
    },
    { immediate: true }
  )

  const currentFile = computed(() => {
    return configs.value.find((c) => c.path === filepath.value)
  })

  const fileExt = computed(() => {
    const name = currentFile.value?.name ?? ''
    if (name.endsWith('.toml')) return 'toml'
    if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml'
    if (name === '.env') return 'env'
    return 'txt'
  })

  const configLanguage = computed(() => {
    const name = currentFile.value?.name ?? ''
    if (name.endsWith('.toml')) return 'ini'
    if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml'
    if (name === '.env') return 'ini'
    return 'plaintext'
  })

  const saveQuickSettings = () => {
    KimiSetup.setQuickSettings()
  }
</script>

<style lang="scss" scoped>
  .quick-settings {
    :deep(.el-form-item__label) {
      padding-bottom: 4px;
    }
  }
</style>
