<template>
  <el-popover
    :show-arrow="false"
    effect="dark"
    popper-class="host-list-poper"
    placement="left-start"
    width="auto"
  >
    <ul v-poper-fix class="host-list-menu">
      <li @click="openEdit"
        ><EditPen width="17" height="17" /><span class="ml-3">{{ t('edit') }}</span></li
      >
      <li v-for="view in views" :key="view" @click="openPanel(view)"
        ><Setting width="17" height="17" /><span class="ml-3">{{ t(view) }}</span></li
      >
      <li @click="copyConnection"
        ><CopyDocument width="17" height="17" /><span class="ml-3">{{ t('connection') }}</span></li
      >
      <li v-if="group?.mode === 'standalone'" @click="remove"
        ><Delete width="17" height="17" /><span class="ml-3">{{ t('delete') }}</span></li
      >
    </ul>
    <template #reference
      ><el-button link :disabled="busy"
        ><yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" /></el-button
    ></template>
  </el-popover>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import { EditPen, Setting, CopyDocument, Delete } from '@element-plus/icons-vue'
  import { ElMessageBox } from 'element-plus'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { clipboard } from '@/util/NodeFn'
  import { MysqlClusterManager as manager } from './manager'
  import type { InstanceSpec } from '../shared'
  import { t } from './lang'
  const props = defineProps<{ instance: InstanceSpec }>()
  const views = ['config', 'errorLog', 'slowLog', 'manage'] as const
  const group = computed(() => manager.groupFor(props.instance.id))
  const busy = computed(
    () =>
      !!manager.operations[props.instance.id]?.busy ||
      !!manager.operations[group.value?.id ?? '']?.busy
  )
  async function openPanel(view: (typeof views)[number]) {
    const component = await import('./InstancePanel.vue')
    await AsyncComponentShow(component.default, { id: props.instance.id, view })
  }
  async function openEdit() {
    const component = await import('./InstanceDialog.vue')
    await AsyncComponentShow(component.default, { group: group.value })
  }
  function copyConnection() {
    clipboard.writeText(
      `Host: 127.0.0.1\nPort: ${props.instance.port}\nSocket: ${props.instance.socket}\nUser: root`
    )
  }
  async function remove() {
    if (!group.value) return
    try {
      await ElMessageBox.confirm(t('deleteHint'), t('delete'), { type: 'warning' })
    } catch {
      return
    }
    await manager.remove(group.value)
  }
</script>
