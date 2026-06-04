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
        <div v-if="note" class="version-note-delete">
          <strong>{{ I18nT('base.remark') }}:</strong>
          <span>{{ note }}</span>
        </div>
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
  import { MessageError } from '@/util/Element'
  import type { ModuleStaticItem } from '@/core/Module/ModuleStaticItem'
  import { computed } from 'vue'
  import { installedVersionNote, setInstalledVersionNote } from '@/util/InstalledVersionNote'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: ModuleInstalledItem & ModuleStaticItem
  }>()

  const note = computed(() => {
    return installedVersionNote(props.item, props.item.typeFlag)
  })

  const doShowDir = () => {
    show.value = false
    shell.showItemInFolder(props.item?.path ?? props.item?.appDir)
  }

  const brewStore = BrewStore()

  const doDel = () => {
    console.log('doDel: ', props.item)
    show.value = false
    const m = props.item
    m.running = true
    const service = brewStore
      .module(props.item.typeFlag)
      .installed.find((f) => f.bin === props.item.bin)
    console.log('doDel service: ', service)
    const stop = (): Promise<string | boolean> => {
      return new Promise<string | boolean>((resolve) => {
        if (!service?.stop) {
          resolve(true)
          return
        }
        service.stop().then(resolve)
      })
    }
    stop()
      .then(() => fs.remove(props.item?.path ?? props.item?.appDir))
      .then(() => {
        return setInstalledVersionNote(props.item, '', props.item.typeFlag)
      })
      .catch((err: any) => {
        MessageError(`${err}`)
      })
      .finally(() => {
        const module = brewStore.module(props.item.typeFlag)
        module.installed = brewStore
          .module(props.item.typeFlag)
          .installed.filter((f) => f.bin !== props.item.bin)
        module.resetCurrentVersion(true)
        module.fetchStatic()
      })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>

<style lang="scss" scoped>
  .version-note-delete {
    margin-top: 12px;
    word-break: break-word;
  }
</style>
