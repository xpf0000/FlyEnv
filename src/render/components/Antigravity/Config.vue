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
          <el-button link :disabled="AntigravitySetup.loading" @click="AntigravitySetup.init()">
            <yb-icon
              :svg="import('@/svg/icon_refresh.svg?raw')"
              class="w-[24px] h-[24px]"
              :class="{ 'fa-spin': AntigravitySetup.loading }"
            ></yb-icon>
          </el-button>
        </div>
      </template>
      <template #default>
        <ConfVM
          :key="filepath"
          ref="conf"
          class="h-full overflow-hidden"
          :type-flag="'antigravity'"
          :show-load-default="false"
          :file="filepath"
          :file-ext="'json'"
          :show-commond="isSettingsFile"
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
  import { AntigravitySetup } from '@/components/Antigravity/setup'
  import { debounce } from 'lodash-es'
  import { uuid } from '@/util/Index'

  const conf = ref()

  const configs = computed(() => {
    return Object.entries(AntigravitySetup.configPaths).map(([name, path]) => ({ name, path }))
  })

  const filepath = computed({
    get() {
      return AntigravitySetup.confTab
    },
    set(value) {
      AntigravitySetup.confTab = value
    }
  })

  watch(
    configs,
    (val) => {
      if (val.length > 0 && !filepath.value) {
        filepath.value = val[0].path
      }
    },
    { immediate: true }
  )

  const names: CommonSetItem[] = [
    {
      name: 'model',
      value: '',
      enable: true,
      tips() {
        return I18nT('common.label.model')
      }
    },
    {
      name: 'enableTerminalSandbox',
      value: 'false',
      enable: true,
      options: [
        { value: 'true', label: 'true' },
        { value: 'false', label: 'false' }
      ],
      tips() {
        return I18nT('antigravity.sandboxMode')
      }
    },
    {
      name: 'toolPermission',
      value: 'request-review',
      enable: true,
      options: [
        { value: 'always-proceed', label: 'always-proceed' },
        { value: 'request-review', label: 'request-review' },
        { value: 'strict', label: 'strict' },
        { value: 'proceed-in-sandbox', label: 'proceed-in-sandbox' }
      ],
      tips() {
        return I18nT('antigravity.toolPermission')
      }
    }
  ]

  // Keys whose value should be written as a JSON boolean rather than a string.
  const booleanKeys = new Set(['enableTerminalSandbox'])

  const commonSetting: Ref<CommonSetItem[]> = ref([])
  let editConfig = ''
  let watcher: any

  const settingsPath = computed(() => AntigravitySetup.configPaths['settings.json'])
  const isSettingsFile = computed(() => filepath.value === settingsPath.value)

  const parseJson = (content: string): any => {
    try {
      return content ? JSON.parse(content) : {}
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
        if (item.value === '') {
          delete config[item.name]
        } else if (booleanKeys.has(item.name)) {
          config[item.name] = item.value === 'true'
        } else {
          config[item.name] = item.value
        }
      } else {
        delete config[item.name]
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
      const find = config[item.name]
      item.enable = typeof find !== 'undefined'
      item.value = String(find ?? item.value)
      item.key = uuid()
      return item
    })
    commonSetting.value = reactive(arr) as any
    watcher = watch(commonSetting, debounce(onSettingUpdate, 500), { deep: true })
  }

  const onTypeChange = (type: 'default' | 'common', config: string) => {
    // The common-settings block only maps onto settings.json keys.
    if (!isSettingsFile.value) {
      return
    }
    if (editConfig !== config || commonSetting.value.length === 0) {
      editConfig = config
      getCommonSetting()
    }
  }
</script>
