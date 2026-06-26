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
          <el-button link :disabled="CodexSetup.loading" @click="CodexSetup.init()">
            <yb-icon
              :svg="import('@/svg/icon_refresh.svg?raw')"
              class="w-[24px] h-[24px]"
              :class="{ 'fa-spin': CodexSetup.loading }"
            ></yb-icon>
          </el-button>
        </div>
      </template>
      <template #default>
        <ConfVM
          :key="filepath"
          ref="conf"
          class="h-full overflow-hidden"
          :type-flag="'codex'"
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
  import { CodexSetup } from '@/components/Codex/setup'
  import { debounce } from 'lodash-es'
  import { parseToml as TOMLParse, stringifyToml as TOMLStringify } from '@shared/toml'
  import { uuid } from '@/util/Index'

  const conf = ref()

  const configs = computed(() => {
    return Object.entries(CodexSetup.configPaths).map(([name, path]) => ({ name, path }))
  })

  const filepath = computed({
    get() {
      return CodexSetup.confTab
    },
    set(value) {
      CodexSetup.confTab = value
    }
  })

  const configTomlPath = computed(() => CodexSetup.configPaths['config.toml'])
  const isConfigToml = computed(() => filepath.value === configTomlPath.value)

  const currentName = computed(
    () => configs.value.find((c) => c.path === filepath.value)?.name ?? ''
  )
  const fileExt = computed(() => (currentName.value.endsWith('.json') ? 'json' : 'toml'))
  const configLanguage = computed(() => (currentName.value.endsWith('.json') ? 'json' : 'ini'))

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
        return I18nT('codex.model')
      }
    },
    {
      name: 'model_reasoning_effort',
      value: 'medium',
      enable: true,
      options: [
        { value: 'minimal', label: 'minimal' },
        { value: 'low', label: 'low' },
        { value: 'medium', label: 'medium' },
        { value: 'high', label: 'high' },
        { value: 'xhigh', label: 'xhigh' }
      ],
      tips() {
        return I18nT('codex.reasoningEffort')
      }
    },
    {
      name: 'approval_policy',
      value: 'on-request',
      enable: true,
      options: [
        { value: 'untrusted', label: 'untrusted' },
        { value: 'on-failure', label: 'on-failure' },
        { value: 'on-request', label: 'on-request' },
        { value: 'never', label: 'never' }
      ],
      tips() {
        return I18nT('codex.approvalPolicy')
      }
    },
    {
      name: 'sandbox_mode',
      value: 'workspace-write',
      enable: true,
      options: [
        { value: 'read-only', label: 'read-only' },
        { value: 'workspace-write', label: 'workspace-write' },
        { value: 'danger-full-access', label: 'danger-full-access' }
      ],
      tips() {
        return I18nT('codex.sandboxMode')
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
        if (item.value === '') {
          delete config[item.name]
        } else {
          config[item.name] = item.value
        }
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
      item.enable = typeof find !== 'undefined'
      item.value = String(find ?? item.value)
      item.key = uuid()
      return item
    })
    commonSetting.value = reactive(arr) as any
    watcher = watch(commonSetting, debounce(onSettingUpdate, 500), { deep: true })
  }

  const onTypeChange = (type: 'default' | 'common', config: string) => {
    if (!isConfigToml.value) {
      return
    }
    if (editConfig !== config || commonSetting.value.length === 0) {
      editConfig = config
      getCommonSetting()
    }
  }
</script>
