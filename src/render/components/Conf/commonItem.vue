<template>
  <el-card v-if="item.show !== false" :header="item.name">
    <template #header>
      <div class="flex items-center justify-between gap-2 overflow-hidden">
        <div class="flex-1 overflow-hidden flex items-center gap-0.5">
          <template v-if="item.showEnable !== false">
            <el-checkbox v-model="enable"></el-checkbox>
          </template>
          <span class="truncate flex-1 select-text">{{ item.name }}</span>
        </div>
        <el-tooltip :content="item.tips()" placement="top" popper-class="max-w-[70%]">
          <yb-icon
            class="flex-shrink-0"
            style="opacity: 0.7"
            :svg="import('@/svg/question.svg?raw')"
            width="15"
            height="15"
          />
        </el-tooltip>
      </div>
    </template>
    <template #default>
      <template v-if="item.options">
        <el-select v-model="value" :disabled="!item.enable" class="w-full">
          <template v-for="(option, _j) in item.options" :key="_j">
            <el-option :label="option.label" :value="option.value"></el-option>
          </template>
        </el-select>
      </template>
      <template v-else-if="item.isFile || item.isDir">
        <el-input v-model.trim="value" :disabled="!item.enable">
          <template #append>
            <el-button :icon="Folder" @click.stop="chooseFile(item?.isDir ?? false)" />
          </template>
        </el-input>
      </template>
      <template v-else>
        <el-input v-model.trim="value" :disabled="!item.enable"></el-input>
      </template>
    </template>
  </el-card>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import type { CommonSetItem } from '@/components/Conf/setup'
  import { Folder } from '@element-plus/icons-vue'

  const { dialog } = require('@electron/remote')

  const props = defineProps<{
    item: CommonSetItem
  }>()

  const enable = computed({
    get() {
      return props?.item?.enable
    },
    set(v) {
      const item: CommonSetItem = props.item
      item.enable = v
    }
  })

  const value = computed({
    get() {
      return props?.item?.value
    },
    set(v) {
      const item: CommonSetItem = props.item
      item.value = v
    }
  })

  const chooseFile = (isDir: boolean) => {
    const options: any = {}
    let opt = ['openFile', 'showHiddenFiles']
    if (isDir) {
      opt = ['openDirectory', 'createDirectory', 'showHiddenFiles']
    }
    options.properties = opt
    options.defaultPath = props.item.value
    dialog.showOpenDialog(options).then(({ canceled, filePaths }: any) => {
      if (canceled || filePaths.length === 0) {
        return
      }
      const [path] = filePaths
      const item: CommonSetItem = props.item
      item.value = path
    })
  }
</script>
