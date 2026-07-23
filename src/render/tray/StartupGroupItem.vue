<template>
  <li class="non-draggable startup-group-item">
    <div class="left">
      <span
        class="startup-group-color"
        :style="{ backgroundColor: item.color || '#409eff' }"
      ></span>
      <span class="title">{{ item.name }}</span>
    </div>
    <el-switch
      :model-value="item.run"
      :disabled="item.disabled"
      :loading="item.running"
      @change="startupGroupDo"
    />
  </li>
</template>

<script lang="ts" setup>
  import type { TrayStartupGroupItem } from '@shared/Tray'
  import IPC from '@/util/IPC'

  const props = defineProps<{
    item: TrayStartupGroupItem
  }>()

  const startupGroupDo = () => {
    IPC.send('APP:Tray-Command', 'startupGroupDo', props.item.id).then((key: string) => {
      IPC.off(key)
    })
  }
</script>
