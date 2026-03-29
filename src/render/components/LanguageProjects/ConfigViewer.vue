<template>
  <el-drawer
    v-model="show"
    size="60%"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-edit">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">{{ I18nT('base.configFile') }}</span>
        </div>
      </div>
      <div class="flex-1 overflow-hidden">
        <el-tabs v-model="activeTab" type="border-card" class="h-full flex flex-col">
          <template v-for="(config, index) in configs" :key="index">
            <el-tab-pane :label="config.name || config.path" :name="index" class="h-full">
              <div class="h-full flex flex-col">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm text-gray-500">{{ config.path }}</span>
                  <el-button type="primary" size="small" @click="saveConfig(index)">
                    {{ I18nT('base.save') }}
                  </el-button>
                </div>
                <div class="flex-1 overflow-hidden">
                  <MonacoEditor
                    :model-value="configContents[index] || ''"
                    :options="editorOptions"
                    language="ini"
                    class="h-full"
                    @update:model-value="(val: string) => updateContent(index, val)"
                  />
                </div>
              </div>
            </el-tab-pane>
          </template>
        </el-tabs>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref, onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { fs } from '@/util/NodeFn'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import MonacoEditor from '@/components/Editor/Monaco/index.vue'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    configs: Array<{ name: string; path: string }>
  }>()

  const activeTab = ref(0)
  const configContents = ref<string[]>([])
  const modifiedContents = ref<string[]>([])

  const editorOptions = {
    fontSize: 14,
    readOnly: false,
    wordWrap: 'on',
    minimap: { enabled: false }
  }

  const loadConfig = async (index: number) => {
    try {
      const config = props.configs[index]
      if (config && config.path) {
        const content = await fs.readFile(config.path)
        configContents.value[index] = content
        modifiedContents.value[index] = content
      }
    } catch (e: any) {
      MessageError(e.message)
      configContents.value[index] = ''
      modifiedContents.value[index] = ''
    }
  }

  const updateContent = (index: number, val: string) => {
    modifiedContents.value[index] = val
  }

  const saveConfig = async (index: number) => {
    try {
      const config = props.configs[index]
      if (config && config.path) {
        await fs.writeFile(config.path, modifiedContents.value[index])
        configContents.value[index] = modifiedContents.value[index]
        MessageSuccess(I18nT('base.success'))
      }
    } catch (e: any) {
      MessageError(e.message)
    }
  }

  onMounted(() => {
    props.configs.forEach((_, index) => {
      loadConfig(index)
    })
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
