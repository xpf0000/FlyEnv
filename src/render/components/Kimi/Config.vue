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
              class="w-[24px] h-[24px]"
              :class="{ 'fa-spin': KimiSetup.loading }"
            ></yb-icon>
          </el-button>
        </div>
      </template>
      <template #default>
        <ConfVM
          :key="filepath"
          ref="conf"
          class="h-full overflow-hidden"
          :type-flag="'kimi'"
          :show-load-default="false"
          :file="filepath"
          :file-ext="fileExt"
          :config-language="configLanguage"
          :show-commond="isConfigToml"
          @on-type-change="onTypeChange"
        >
          <template #common>
            <div class="p-4 h-full overflow-auto">
              <Common :setting="commonSetting" />
            </div>
          </template>
        </ConfVM>
      </template>
      <template #footer>
        <ToolVM v-if="conf" :conf="conf"></ToolVM>
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch, Ref, reactive } from 'vue'
  import ConfVM from '@/components/Conf/conf.vue'
  import ToolVM from '@/components/Conf/tool.vue'
  import Common from '@/components/Conf/common.vue'
  import { type CommonSetItem } from '@/components/Conf/setup'
  import { I18nT } from '@lang/index'
  import { KimiSetup } from '@/components/Kimi/setup'
  import { debounce } from 'lodash-es'
  import * as TOML from '@ltd/j-toml'
  const TOMLParse = TOML.parse
  const TOMLStringify = TOML.stringify
  import { uuid } from '@/util/Index'

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
  const isConfigToml = computed(() => filepath.value === configTomlPath.value)

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

  const names: CommonSetItem[] = [
    {
      name: 'default_permission_mode',
      value: 'manual',
      enable: true,
      options: [
        { value: 'manual', label: 'manual' },
        { value: 'auto', label: 'auto' },
        { value: 'yolo', label: 'yolo' }
      ],
      tips() {
        return I18nT('kimi.permissionMode')
      }
    },
    {
      name: 'default_thinking',
      value: 'false',
      enable: true,
      options: [
        { value: 'true', label: 'true' },
        { value: 'false', label: 'false' }
      ],
      tips() {
        return I18nT('kimi.defaultThinking')
      }
    },
    {
      name: 'default_plan_mode',
      value: 'false',
      enable: true,
      options: [
        { value: 'true', label: 'true' },
        { value: 'false', label: 'false' }
      ],
      tips() {
        return I18nT('kimi.defaultPlanMode')
      }
    },
    {
      name: 'telemetry',
      value: 'true',
      enable: true,
      options: [
        { value: 'true', label: 'true' },
        { value: 'false', label: 'false' }
      ],
      tips() {
        return I18nT('kimi.telemetry')
      }
    }
  ]

  const commonSetting: Ref<CommonSetItem[]> = ref([])
  let editConfig = ''
  let watcher: any

  const onSettingUpdate = () => {
    if (!editConfig) {
      return
    }
    const config: any = TOMLParse(editConfig)
    commonSetting.value.forEach((item) => {
      if (item.enable) {
        let value: any = item.value
        if (
          item.name === 'default_thinking' ||
          item.name === 'default_plan_mode' ||
          item.name === 'telemetry'
        ) {
          value = value === 'true'
        }
        config[item.name] = value
      } else {
        delete config[item.name]
      }
    })
    const content = TOMLStringify(config)
    conf.value.setEditValue(content)
    editConfig = content
  }

  const getCommonSetting = () => {
    if (watcher) {
      watcher()
    }
    const config: any = editConfig ? TOMLParse(editConfig) : {}
    const arr = names.map((item) => {
      const find = config[item.name]
      let value = find ?? item.value
      if (
        item.name === 'default_thinking' ||
        item.name === 'default_plan_mode' ||
        item.name === 'telemetry'
      ) {
        value = String(value === true || value === 'true')
      } else {
        value = String(value)
      }
      item.enable = typeof find !== 'undefined'
      item.value = value
      item.key = uuid()
      return item
    })
    commonSetting.value = reactive(arr) as any
    watcher = watch(commonSetting, debounce(onSettingUpdate, 500), { deep: true })
  }

  const onTypeChange = (type: 'default' | 'common', config: string) => {
    if (editConfig !== config || commonSetting.value.length === 0) {
      editConfig = config
      getCommonSetting()
    }
  }
</script>
