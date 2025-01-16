<template>
  <div class="module-config">
    <el-card>
      <div v-show="type === 'default'" ref="input" class="block"></div>
      <el-scrollbar v-show="type === 'common'" class="p-4">
        <slot name="common"></slot>
      </el-scrollbar>
      <template #footer>
        <div class="tool gap-3">
          <el-radio-group v-if="showCommond" v-model="type" size="small">
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
          <el-button-group>
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
            <el-tooltip
              v-if="showLoadDefault !== false"
              :show-after="600"
              :content="I18nT('conf.loadDefault')"
              placement="top"
            >
              <el-button :disabled="disabled || defaultDisabled" @click="getDefault">
                <yb-icon :svg="import('@/svg/load-default.svg?raw')" class="w-5 h-5" />
              </el-button>
            </el-tooltip>
          </el-button-group>
          <el-button-group>
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
          <template v-if="!!url">
            <el-tooltip :content="url" :show-after="600" placement="top">
              <el-button @click="openURL(url)">
                <yb-icon :svg="import('@/svg/http.svg?raw')" class="w-5 h-5" />
              </el-button>
            </el-tooltip>
          </template>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, watch } from 'vue'
  import { Document, Operation, FolderOpened } from '@element-plus/icons-vue'
  import type { AllAppModule } from '@/core/type'
  import { ConfSetup } from '@/components/Conf/setup'
  import { I18nT } from '@shared/lang'

  const props = withDefaults(
    defineProps<{
      file: string
      defaultFile?: string
      defaultConf?: string
      fileExt: string
      typeFlag: AllAppModule
      showCommond: boolean
      showLoadDefault?: boolean
      url?: string
    }>(),
    {
      showLoadDefault: true
    }
  )

  const emit = defineEmits(['onTypeChange'])

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
    openURL
  } = ConfSetup(p)

  watch(
    () => `${type.value}-${disabled.value}-${config.value}`,
    () => {
      if (!disabled.value) {
        emit('onTypeChange', type.value, getEditValue())
      }
    },
    {
      immediate: true
    }
  )

  defineExpose({
    setEditValue,
    update
  })
</script>
