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
          <el-button link :disabled="ClaudeCodeSetup.loading" @click="ClaudeCodeSetup.init()">
            <yb-icon
              :svg="import('@/svg/icon_refresh.svg?raw')"
              class="w-[24px] h-[24px]"
              :class="{ 'fa-spin': ClaudeCodeSetup.loading }"
            ></yb-icon>
          </el-button>
        </div>
      </template>
      <template #default>
        <ConfVM
          :key="filepath"
          ref="conf"
          class="h-full overflow-hidden"
          :type-flag="'claudeCode'"
          :show-load-default="false"
          :file="filepath"
          :file-ext="fileExt"
          :config-language="configLanguage"
          :show-commond="isSettingsJson"
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
  import { ClaudeCodeSetup } from '@/components/ClaudeCode/setup'
  import { debounce } from 'lodash-es'
  import { uuid } from '@/util/Index'

  const conf = ref()

  const configs = computed(() => {
    return Object.entries(ClaudeCodeSetup.configPaths).map(([name, path]) => ({ name, path }))
  })

  const filepath = computed({
    get() {
      return ClaudeCodeSetup.confTab
    },
    set(value) {
      ClaudeCodeSetup.confTab = value
    }
  })

  const settingsJsonPath = computed(() => ClaudeCodeSetup.configPaths['settings.json'])
  const isSettingsJson = computed(() => filepath.value === settingsJsonPath.value)

  watch(
    configs,
    (val) => {
      if (val.length > 0 && !filepath.value) {
        filepath.value = val[0].path
      }
    },
    { immediate: true }
  )

  const fileExt = 'json'
  const configLanguage = 'json'

  const names: CommonSetItem[] = [
    {
      name: 'theme',
      value: 'auto',
      enable: true,
      options: [
        { value: 'auto', label: 'auto' },
        { value: 'dark', label: 'dark' },
        { value: 'light', label: 'light' }
      ],
      tips() {
        return I18nT('claudeCode.theme')
      }
    },
    {
      name: 'model',
      value: '',
      enable: true,
      tips() {
        return I18nT('claudeCode.model')
      }
    },
    {
      name: 'includeCoAuthoredBy',
      value: 'true',
      enable: true,
      options: [
        { value: 'true', label: 'true' },
        { value: 'false', label: 'false' }
      ],
      tips() {
        return I18nT('claudeCode.includeCoAuthoredBy')
      }
    },
    {
      name: 'cleanupPeriodDays',
      value: '30',
      enable: true,
      tips() {
        return I18nT('claudeCode.cleanupPeriodDays')
      }
    }
  ]

  const boolKeys = ['includeCoAuthoredBy']
  const numberKeys = ['cleanupPeriodDays']

  const commonSetting: Ref<CommonSetItem[]> = ref([])
  let editConfig = ''
  let watcher: any

  const parseJson = (str: string): any => {
    try {
      return str.trim() ? JSON.parse(str) : {}
    } catch {
      return {}
    }
  }

  const onSettingUpdate = () => {
    if (!editConfig) {
      return
    }
    const config: any = parseJson(editConfig)
    commonSetting.value.forEach((item) => {
      if (item.enable) {
        let value: any = item.value
        if (boolKeys.includes(item.name!)) {
          value = value === 'true'
        } else if (numberKeys.includes(item.name!)) {
          value = Number(value)
        }
        if (value === '' || (numberKeys.includes(item.name!) && isNaN(value))) {
          delete config[item.name!]
        } else {
          config[item.name!] = value
        }
      } else {
        delete config[item.name!]
      }
    })
    const content = JSON.stringify(config, null, 2)
    conf.value.setEditValue(content)
    editConfig = content
  }

  const getCommonSetting = () => {
    if (watcher) {
      watcher()
    }
    const config: any = parseJson(editConfig)
    const arr = names.map((item) => {
      const find = config[item.name!]
      let value = find ?? item.value
      if (boolKeys.includes(item.name!)) {
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
