<template>
  <div class="main-wapper">
    <div v-show="type === 'default'" ref="input" class="block"></div>
    <template v-if="showCommond">
      <el-scrollbar v-if="type === 'common'" class="p-2">
        <slot name="common"></slot>
      </el-scrollbar>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { computed, watch } from 'vue'
  import type { AllAppModule } from '@/core/type'
  import { ConfSetup } from '@/components/Conf/setup'
  import type { SoftInstalled } from '@/store/brew'

  const props = withDefaults(
    defineProps<{
      file: string
      defaultFile?: string
      defaultConf?: string
      fileExt: string
      typeFlag: AllAppModule
      showCommond: boolean
      url?: string
      showLoadDefault?: boolean
      version?: SoftInstalled
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
    openURL,
    watchFlag,
    setEditLanguage,
    onEditerInited,
    getConfig
  } = ConfSetup(p)

  watch(
    watchFlag,
    () => {
      if (!disabled.value && type.value === 'common') {
        emit('onTypeChange', type.value, getEditValue())
      }
    },
    {
      immediate: true
    }
  )

  const showCommond = computed(() => {
    return props.showCommond
  })

  const url = computed(() => {
    return props.url
  })

  const showLoadDefault = computed(() => {
    return props.showLoadDefault
  })

  defineExpose({
    getConfig,
    setEditValue,
    update,
    setEditLanguage,
    onEditerInited,
    changed,
    defaultDisabled,
    getDefault,
    saveConfig,
    saveCustom,
    openConfig,
    loadCustom,
    openURL,
    type,
    showCommond,
    url,
    showLoadDefault,
    disabled
  })
</script>
