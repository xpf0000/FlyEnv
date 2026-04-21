<template>
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

<script lang="ts" setup>
  import { computed } from 'vue'
  import { Document, Operation, FolderOpened } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'

  const props = defineProps<{
    conf?: any
  }>()

  const showCommond = computed(() => {
    return props?.conf?.showCommond
  })

  const disabled = computed(() => {
    return props?.conf?.disabled
  })

  const showLoadDefault = computed(() => {
    return props?.conf?.showLoadDefault
  })

  const defaultDisabled = computed(() => {
    return props?.conf?.defaultDisabled
  })

  const changed = computed(() => {
    return props?.conf?.changed
  })

  const url = computed(() => {
    return props?.conf?.url
  })

  const type = computed({
    get() {
      return props?.conf?.type
    },
    set(value) {
      const conf: any = props.conf
      conf.type = value
    }
  })

  const openConfig = () => {
    props.conf?.openConfig()
  }

  const saveConfig = () => {
    props.conf?.saveConfig()
  }

  const getDefault = () => {
    props.conf?.getDefault()
  }

  const loadCustom = () => {
    props.conf?.loadCustom()
  }

  const saveCustom = () => {
    props.conf?.saveCustom()
  }

  const openURL = (url: string) => {
    props.conf?.openURL(url)
  }
</script>
