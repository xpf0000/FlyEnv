<template>
  <div class="main-wapper">
    <div v-show="type === 'default'" ref="input" class="block"></div>
    <el-scrollbar v-show="type === 'common'" class="p-2">
      <slot name="common"></slot>
    </el-scrollbar>
  </div>
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

<script lang="ts" setup>
  import { computed, watch } from 'vue'
  import { Document, Operation, FolderOpened } from '@element-plus/icons-vue'
  import type { AllAppModule } from '@web/core/type'
  import { ConfSetup } from '@web/components/Conf/setup'
  import { I18nT } from '@shared/lang'

  const props = defineProps<{
    conf: string
    fileExt: string
    typeFlag: AllAppModule
    showCommond: boolean
  }>()

  const emit = defineEmits(['onTypeChange'])

  const p = computed(() => {
    return {
      conf: props.conf,
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
    setEditValue
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
