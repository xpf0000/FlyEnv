<template>
  <div class="chat-plant-choosesiteroot">
    <div class="title"> {{ $t('ai.selectSiteDirectory') }} </div>
    <div class="btns">
      <el-button :disabled="item.actionEnd" type="primary" @click.stop="chooseDir()">{{
        $t('ai.selectFolder')
      }}</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { AIStore } from '@/components/AI/store'
  import type { AIChatItem } from '@shared/app'
  import { dialog } from '@/util/NodeFn'

  const props = defineProps<{
    item: AIChatItem
  }>()

  const aiStore = AIStore()
  const chooseDir = () => {
    const opt = ['openDirectory', 'createDirectory', 'showHiddenFiles']
    dialog
      .showOpenDialog({
        properties: opt
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        aiStore?.currentTask?.next(path)
        const item = props.item
        item.actionEnd = true
      })
  }
</script>
