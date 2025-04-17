<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15 title">{{ file }}</span>
        </div>
      </div>
      <div class="main-wapper">
        <div ref="input" class="block"></div>
      </div>
      <div class="tool">
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
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { FolderOpened } from '@element-plus/icons-vue'
  import type { AllAppModule } from '@/core/type'
  import { ConfSetup } from '@/components/Conf/setup'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import Common from '@/components/Conf/common.vue'

  const props = defineProps<{
    file: string
    fileExt: string
    typeFlag: AllAppModule
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const p = computed(() => {
    return {
      file: props.file,
      fileExt: props.fileExt,
      typeFlag: props.typeFlag,
      emptyTips: ''
    }
  })

  const { changed, input, disabled, saveConfig, saveCustom, openConfig, loadCustom } = ConfSetup(p)

  defineExpose({ show, onClosed, onSubmit, closedFn })
</script>
