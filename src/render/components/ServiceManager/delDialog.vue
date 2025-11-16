<template>
  <el-dialog
    v-model="show"
    :title="I18nT('base.attention')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <div class="main-wapper">
        {{ I18nT('base.staticDelAlert') }}
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button type="warning" @click="doDel">{{ I18nT('base.ForceDelete') }}</el-button>
        <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" @click="doShowDir">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { shell, fs } from '@/util/NodeFn'
  import { BrewStore } from '@/store/brew'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: ModuleInstalledItem
  }>()

  const doShowDir = () => {
    show.value = false
    shell.showItemInFolder(props.item.path)
  }

  const brewStore = BrewStore()

  const doDel = () => {
    show.value = false
    const m = props.item
    m.running = true
    props.item
      .stop()
      .then(() => fs.remove(props.item.path))
      .finally(() => {
        brewStore.module(props.item.typeFlag).installed = brewStore
          .module(props.item.typeFlag)
          .installed.filter((f) => f.path !== props.item.path)
      })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
