<template>
  <el-dialog
    v-model="show"
    :title="I18nT('base.attention')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit new-project"
    @closed="handleClosed"
  >
    <template #default>
      <div class="main-wapper">
        {{ I18nT('base.versionDeleteManual') }}
        <div v-if="note" class="version-note-delete">
          <strong>{{ I18nT('base.remark') }}:</strong>
          <span>{{ note }}</span>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button
          v-if="managedDirectory"
          type="warning"
          :disabled="VersionDeleteController.isDeleting(managedDirectory.path)"
          @click="openDeleteConfirmation"
          >{{ I18nT('base.ForceDelete') }}</el-button
        >
        <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" @click="doShowDir">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
  </el-dialog>
  <el-dialog
    v-model="confirmDelete"
    :title="I18nT('base.ForceDelete')"
    width="600px"
    append-to-body
    :close-on-click-modal="false"
    @close="confirmation = ''"
  >
    <p>{{ I18nT('base.forceDeleteWarning') }}</p>
    <p class="version-delete-path">{{ target.path }}</p>
    <label for="version-force-delete-input">{{ I18nT('base.forceDeleteInput') }}</label>
    <el-input
      id="version-force-delete-input"
      v-model="confirmation"
      class="mt-3"
      :placeholder="FORCE_DELETE_CONFIRMATION"
      autocomplete="off"
      @keyup.enter="doDel"
    />
    <template #footer>
      <el-button @click="confirmDelete = false">{{ I18nT('base.cancel') }}</el-button>
      <el-button type="danger" :disabled="!canDelete" @click="doDel">{{
        I18nT('base.confirm')
      }}</el-button>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { shell } from '@/util/NodeFn'
  import type { ModuleStaticItem } from '@/core/Module/ModuleStaticItem'
  import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
  import { installedVersionNote } from '@/util/InstalledVersionNote'
  import { createVersionDeleteLifecycle } from '@/util/versionDeleteLifecycle'
  import type { CallbackFn } from '@shared/app'
  import { FORCE_DELETE_CONFIRMATION, type ManagedVersionDirectory } from '@shared/VersionDelete'
  import VersionDeleteController from './VersionDeleteController'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: ModuleInstalledItem | ModuleStaticItem
    onDone?: CallbackFn
  }>()

  const lifecycle = createVersionDeleteLifecycle(props.onDone)
  const target = Object.freeze({
    path: 'path' in props.item ? props.item.path : props.item.appDir,
    bin: props.item.bin,
    typeFlag: props.item.typeFlag,
    version: props.item.version
  })
  const managedDirectory = ref<ManagedVersionDirectory>()
  const confirmDelete = ref(false)
  const confirmation = ref('')
  let disposed = false
  onBeforeUnmount(() => {
    disposed = true
  })
  onMounted(async () => {
    const directory = await VersionDeleteController.inspect(target)
    if (!disposed) managedDirectory.value = directory
  })
  const canDelete = computed(
    () =>
      !!managedDirectory.value &&
      confirmation.value === FORCE_DELETE_CONFIRMATION &&
      !VersionDeleteController.isDeleting(managedDirectory.value.path)
  )

  const note = computed(() => {
    return installedVersionNote(
      { ...target, num: null, enable: true, run: false, running: false },
      target.typeFlag
    )
  })

  const handleClosed = () => {
    lifecycle.handleClosed()
    closedFn()
  }

  const doShowDir = () => {
    show.value = false
    shell.showItemInFolder(target.path)
  }

  const openDeleteConfirmation = () => {
    confirmation.value = ''
    confirmDelete.value = true
  }

  const doDel = () => {
    if (!confirmDelete.value || !canDelete.value || !managedDirectory.value) return
    const phrase = confirmation.value
    lifecycle.markDeleting()
    confirmDelete.value = false
    show.value = false
    void VersionDeleteController.remove(
      target,
      managedDirectory.value,
      phrase,
      lifecycle.handleDeleteFinished
    )
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>

<style lang="scss" scoped>
  .version-delete-path {
    margin: 16px 0;
    word-break: break-all;
    font-weight: bold;
  }
  .version-note-delete {
    margin-top: 12px;
    word-break: break-word;
  }
</style>
