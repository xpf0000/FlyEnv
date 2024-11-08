<template>
  <div class="tool">
    <el-tooltip :show-after="600" :content="I18nT('base.open')" placement="top">
      <el-button class="shrink0" :disabled="log?.isDisabled()" @click="log?.logDo('open')">
        <FolderOpened class="w-5 h-5 p-0.5" />
      </el-button>
    </el-tooltip>
    <el-tooltip :show-after="600" :content="I18nT('base.refresh')" placement="top">
      <el-button class="shrink0" :disabled="log?.isDisabled()" @click="log?.logDo('refresh')">
        <Refresh class="w-5 h-5 p-0.5" />
      </el-button>
    </el-tooltip>
    <el-tooltip :show-after="600" :content="I18nT('base.clean')" placement="top">
      <el-button class="shrink0" :disabled="log?.isDisabled()" @click="log?.logDo('clean')">
        <Notebook class="w-5 h-5 p-0.5" />
      </el-button>
    </el-tooltip>
  </div>
</template>

<script lang="ts" setup>
  import { I18nT } from '@shared/lang'
  import { FolderOpened, Refresh, Notebook } from '@element-plus/icons-vue'

  defineProps<{
    log: any
  }>()
</script>
