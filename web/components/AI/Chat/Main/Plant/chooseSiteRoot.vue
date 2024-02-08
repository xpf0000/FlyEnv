<template>
  <div class="chat-plant-choosesiteroot">
    <div class="title"> {{ $t('ai.选择站点目录') }} </div>
    <div class="btns">
      <el-button :disabled="item.actionEnd" type="primary" @click.stop="chooseDir()">{{
        $t('ai.选择文件夹')
      }}</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { AIStore } from '@web/components/AI/store'
  import type { AIChatItem } from '@shared/app'

  const props = defineProps<{
    item: AIChatItem
  }>()

  const aiStore = AIStore()
  const chooseDir = () => {
    aiStore?.currentTask?.next('/Users/XXX/Desktop/Web/xxxx')
    const item = props.item
    item.actionEnd = true
  }
</script>
