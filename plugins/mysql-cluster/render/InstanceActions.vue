<template>
  <el-popover
    ref="popover"
    :show-arrow="false"
    effect="dark"
    popper-class="host-list-poper"
    placement="left-start"
    width="auto"
  >
    <ul v-poper-fix class="host-list-menu">
      <li @click="openEdit"
        ><Edit width="17" height="17" /><span class="ml-3">{{ t('edit') }}</span></li
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
  import { computed, ref } from 'vue'
  import { Edit, Setting, CopyDocument, Delete } from '@element-plus/icons-vue'
  import { ElMessageBox } from 'element-plus'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { InstanceActions } from './actions'
  import { MysqlClusterManager as manager } from './manager'
  import type { InstanceSpec } from '../shared'
  import { t } from './lang'
  const props = defineProps<{ instance: InstanceSpec }>()
  const popover = ref<{ hide(): void }>()
  const views = ['config', 'errorLog', 'slowLog', 'manage'] as const
  const group = computed(() => manager.groupFor(props.instance.id))
  const busy = computed(
    () =>
      !!manager.operations[props.instance.id]?.busy ||
      !!manager.operations[group.value?.id ?? '']?.busy
  )
  async function openPanel(view: (typeof views)[number]) {
    popover.value?.hide()
    await InstanceActions.open(props.instance.id, view)
  }
  async function openEdit() {
    popover.value?.hide()
    const component = await import('./InstanceDialog.vue')
    await AsyncComponentShow(component.default, { group: group.value })
  }
  function copyConnection() {
    popover.value?.hide()
    return InstanceActions.copyConnection(props.instance)
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
