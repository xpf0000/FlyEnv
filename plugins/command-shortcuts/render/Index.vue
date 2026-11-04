<template>
  <div class="soft-index-panel main-right-panel command-shortcuts-page">
    <div class="flex flex-shrink-0 items-center justify-between gap-4 py-3">
      <div class="min-w-0">
        <h2 class="text-xl font-semibold">{{ ShortcutsT('title') }}</h2>
        <p class="text-sm text-zinc-500">{{ ShortcutsT('subtitle') }}</p>
      </div>
      <el-button
        type="primary"
        :disabled="!manager.initialized || mutationBusy"
        @click="editFolder()"
      >
        {{ ShortcutsT('addFolder') }}
      </el-button>
    </div>

    <el-alert v-if="manager.loadError" type="error" :closable="false" class="mb-4">
      <template #title>{{ ShortcutsT('loadFailed') }}</template>
      <div class="break-all">{{ ShortcutsT(manager.loadError) }}</div>
      <el-button type="primary" link :loading="manager.loading" @click="manager.load()">{{
        ShortcutsT('retry')
      }}</el-button>
    </el-alert>

    <div v-loading="manager.loading" class="main-block">
      <el-scrollbar>
        <el-empty
          v-if="manager.initialized && manager.folders.length === 0"
          :description="ShortcutsT('empty')"
        >
          <el-button type="primary" :disabled="mutationBusy" @click="editFolder()">{{
            ShortcutsT('addFolder')
          }}</el-button>
        </el-empty>
        <draggable
          v-else
          v-model="orderedFolders"
          item-key="id"
          handle=".command-shortcuts-folder-drag-handle"
          class="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3"
          ghost-class="command-shortcuts-card-ghost"
          :group="{ name: 'shortcut-folders', pull: false, put: false }"
          :disabled="manager.saving || !!draggingCommandFolder || manager.folders.length < 2"
          @start="draggingFolders = true"
          @end="persistFolderOrder"
        >
          <template #item="{ element: folder }">
            <FolderCard
              :folder="folder"
              :reorder-enabled="manager.folders.length > 1"
              :editing-disabled="mutationBusy"
              :drag-disabled="
                manager.saving ||
                draggingFolders ||
                (!!draggingCommandFolder && draggingCommandFolder !== folder.id)
              "
              @edit-folder="editFolder"
              @add-command="editCommand"
              @edit-command="editCommand"
              @remove-folder="removeFolder"
              @remove-command="removeCommand"
              @dragging="(active) => (draggingCommandFolder = active ? folder.id : undefined)"
            />
          </template>
        </draggable>
      </el-scrollbar>
    </div>

    <FolderDialog v-if="folderDialog" :folder="selectedFolder" @close="folderDialog = false" />
    <CommandDialog
      v-if="commandDialog && selectedFolder"
      :folder="selectedFolder"
      :preset="selectedCommand"
      @close="commandDialog = false"
    />
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import draggable from 'vuedraggable'
  import type { CommandFolder, PresetCommand } from '../shared'
  import FolderCard from './FolderCard.vue'
  import FolderDialog from './FolderDialog.vue'
  import CommandDialog from './CommandDialog.vue'
  import { CommandShortcutsManager as manager } from './manager'
  import { ShortcutsT } from './lang'

  const folderDialog = ref(false)
  const commandDialog = ref(false)
  const selectedFolder = ref<CommandFolder>()
  const selectedCommand = ref<PresetCommand>()
  const orderedFolders = ref<CommandFolder[]>([])
  const draggingFolders = ref(false)
  const draggingCommandFolder = ref<string>()
  const mutationBusy = computed(
    () => manager.saving || draggingFolders.value || !!draggingCommandFolder.value
  )

  watch(
    () => manager.folders,
    (folders) => {
      if (!draggingFolders.value) orderedFolders.value = [...folders]
    },
    { immediate: true }
  )

  const persistFolderOrder = async () => {
    try {
      await manager.reorderFolders(orderedFolders.value.map((folder) => folder.id))
    } finally {
      orderedFolders.value = [...manager.folders]
      draggingFolders.value = false
    }
  }
  const editFolder = (folder?: CommandFolder) => {
    selectedFolder.value = folder
    folderDialog.value = true
  }
  const editCommand = (folder: CommandFolder, preset?: PresetCommand) => {
    selectedFolder.value = folder
    selectedCommand.value = preset
    commandDialog.value = true
  }
  const confirmRemoval = async (message: string): Promise<boolean> => {
    try {
      await ElMessageBox.confirm(message, ShortcutsT('confirmTitle'), {
        type: 'warning',
        confirmButtonText: ShortcutsT('delete'),
        cancelButtonText: ShortcutsT('cancel')
      })
      return true
    } catch {
      return false
    }
  }
  const removeFolder = async (folder: CommandFolder) => {
    if (await confirmRemoval(ShortcutsT('deleteFolderConfirm', { name: folder.name })))
      await manager.removeFolder(folder.id)
  }
  const removeCommand = async (folder: CommandFolder, preset: PresetCommand) => {
    if (await confirmRemoval(ShortcutsT('deleteCommandConfirm', { name: preset.description })))
      await manager.removeCommand(folder.id, preset.id)
  }
  onMounted(() => {
    void manager.load()
  })
</script>

<style scoped>
  .command-shortcuts-page > .main-block {
    min-height: 0;
  }
  :deep(.command-shortcuts-card-ghost) {
    opacity: 0.35;
  }
</style>
