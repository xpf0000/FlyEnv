<template>
  <div class="module-config">
    <el-card>
      <div v-show="type === 'default'" ref="input" class="block"></div>
      <template v-if="showCommond">
        <el-scrollbar v-show="type === 'common'" class="p-4">
          <Common :key="commanKey" :setting="commonSetting" />
        </el-scrollbar>
      </template>
      <template #footer>
        <div class="tool">
          <el-radio-group v-if="showCommond" v-model="type" class="mr-7" size="small">
            <el-tooltip :show-after="600" :content="I18nT('conf.rawFile')" placement="top">
              <el-radio-button value="default">
                <Document class="w-5 h-5 p-0.5" />
              </el-radio-button>
            </el-tooltip>
            <el-tooltip :show-after="600" :content="I18nT('conf.CommonSetting')" placement="top">
              <el-radio-button value="common">
                <Operation class="w-5 h-5 p-0.5" />
              </el-radio-button>
            </el-tooltip>
          </el-radio-group>
          <el-tooltip :show-after="600" :content="I18nT('conf.open')" placement="top">
            <el-button :disabled="disabled" @click="openConfig">
              <FolderOpened class="w-5 h-5 p-0.5" />
            </el-button>
          </el-tooltip>
          <el-tooltip :show-after="600" :content="I18nT('conf.save')" placement="top">
            <el-button :disabled="disabled" @click="saveConfig">
              <el-badge is-dot :offset="[8, 1]" :hidden="!changed">
                <yb-icon :svg="import('@/svg/save.svg?raw')" class="w-5 h-5 p-0.5" />
              </el-badge>
            </el-button>
          </el-tooltip>
          <el-tooltip :show-after="600" :content="I18nT('conf.loadDefault')" placement="top">
            <el-button :disabled="disabled || defaultDisabled" @click="getDefault">
              <yb-icon :svg="import('@/svg/load-default.svg?raw')" class="w-5 h-5" />
            </el-button>
          </el-tooltip>
          <el-button-group style="margin-left: 12px">
            <el-tooltip :show-after="600" :content="I18nT('conf.loadCustom')" placement="top">
              <el-button :disabled="disabled" @click="loadCustom">
                <yb-icon :svg="import('@/svg/custom.svg?raw')" class="w-5 h-5 p-0.5" />
              </el-button>
            </el-tooltip>
            <el-tooltip :show-after="600" :content="I18nT('conf.saveCustom')" placement="top">
              <el-button :disabled="disabled" @click="saveCustom">
                <yb-icon :svg="import('@/svg/saveas.svg?raw')" class="w-5 h-5 p-0.5" />
              </el-button>
            </el-tooltip>
          </el-button-group>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, watch, ref } from 'vue'
  import { Document, Operation, FolderOpened } from '@element-plus/icons-vue'
  import type { AllAppModule } from '@/core/type'
  import { type CommonSetItem, ConfSetup } from '@/components/Conf/setup'
  import { I18nT } from '@shared/lang'
  import Common from './common.vue'
  import { uuid } from "@shared/utils"

  const props = defineProps<{
    file: string
    defaultFile?: string
    defaultConf?: string
    fileExt: string
    typeFlag: AllAppModule
    showCommond: boolean
    commonSetting: CommonSetItem[]
  }>()

  const emit = defineEmits(['onTypeChange'])

  const commanKey = ref(uuid())

  const p = computed(() => {
    return {
      file: props.file,
      defaultFile: props.defaultFile,
      defaultConf: props.defaultConf,
      fileExt: props.fileExt,
      typeFlag: props.typeFlag,
      showCommond: props.showCommond
    }
  })

  const {
    changed,
    update,
    config,
    input,
    type,
    disabled,
    defaultDisabled,
    getDefault,
    saveConfig,
    saveCustom,
    openConfig,
    loadCustom,
    getEditValue,
    setEditValue,
    watchFlag
  } = ConfSetup(p)

  watch(
    watchFlag,
    (v) => {
      console.log('watchFlag changed: ', v, disabled.value)
      if (!disabled.value && type.value === 'common') {
        emit('onTypeChange', type.value, getEditValue())
      }
    },
    {
      immediate: true
    }
  )

  watch(() => props.commonSetting, () => {
    console.trace('props.commonSetting changed !!!')
    commanKey.value = uuid()
  })

  defineExpose({
    setEditValue,
    update
  })
</script>
