<template>
  <el-card class="command-shortcuts-card" shadow="hover">
    <template #header>
      <div class="flex min-w-0 items-center gap-2">
        <button
          v-if="reorderEnabled"
          type="button"
          class="command-shortcuts-folder-drag-handle flex h-5 w-5 flex-shrink-0 cursor-grab items-center border-0 bg-transparent p-0 text-zinc-400 active:cursor-grabbing"
          :aria-label="ShortcutsT('dragFolders')"
          :title="ShortcutsT('dragFolders')"
          :disabled="editingDisabled"
          ><yb-icon class="h-5 w-5" :svg="import('@/svg/handle.svg?raw')"
        /></button>
        <FolderAvatar :id="folder.id" :name="folder.name" />
        <div class="min-w-0 flex-1">
          <strong class="block truncate text-base" :title="folder.name">{{ folder.name }}</strong>
          <button
            type="button"
            class="mt-1 block w-full truncate text-left text-xs text-yellow-500"
            :title="folder.path"
            :disabled="editingDisabled || manager.isOpeningPath(folder.id)"
            @click="manager.openFolderPath(folder.id)"
            >{{ folder.path }}</button
          >
        </div>
      </div>
    </template>

    <el-scrollbar v-if="folder.commands.length" height="248px">
      <draggable
        v-model="orderedCommands"
        item-key="id"
        handle=".command-shortcuts-command-drag-handle"
        class="flex flex-col gap-2 pr-2"
        ghost-class="command-shortcuts-command-ghost"
        :group="{ name: `shortcut-commands-${folder.id}`, pull: false, put: false }"
        :disabled="dragDisabled || folder.commands.length < 2"
        @start="startDrag"
        @end="persistCommandOrder"
      >
        <template #item="{ element: preset }">
          <div
            class="flex h-14 items-center justify-between gap-2 rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700"
          >
            <button
              v-if="folder.commands.length > 1"
              type="button"
              class="command-shortcuts-command-drag-handle flex h-5 w-5 flex-shrink-0 cursor-grab items-center border-0 bg-transparent p-0 text-zinc-400 active:cursor-grabbing"
              :aria-label="ShortcutsT('dragCommands')"
              :title="ShortcutsT('dragCommands')"
              :disabled="dragDisabled"
              ><yb-icon class="h-5 w-5" :svg="import('@/svg/handle.svg?raw')"
            /></button>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium" :title="preset.description">{{
                preset.description
              }}</div>
              <code class="mt-1 block truncate text-xs text-zinc-500" :title="preset.command">{{
                preset.command
              }}</code>
            </div>
            <div class="command-shortcuts-command-actions flex flex-shrink-0 items-center gap-1">
              <el-tooltip :content="ShortcutsT('run')" placement="top">
                <el-button
                  :icon="VideoPlay"
                  :aria-label="ShortcutsT('run')"
                  size="small"
                  circle
                  type="success"
                  plain
                  :disabled="editingDisabled"
                  :loading="manager.isOpening(preset.id)"
                  @click="manager.run(folder.id, preset.id)"
                />
              </el-tooltip>
              <el-tooltip :content="ShortcutsT('editCommand')" placement="top">
                <el-button
                  :icon="Edit"
                  :aria-label="ShortcutsT('editCommand')"
                  size="small"
                  circle
                  :disabled="editingDisabled"
                  @click="emit('edit-command', folder, preset)"
                />
              </el-tooltip>
              <el-tooltip :content="ShortcutsT('delete')" placement="top">
                <el-button
                  :icon="Delete"
                  :aria-label="ShortcutsT('delete')"
                  size="small"
                  circle
                  type="danger"
                  plain
                  :disabled="editingDisabled"
                  @click="emit('remove-command', folder, preset)"
                />
              </el-tooltip>
            </div>
          </div>
        </template>
      </draggable>
    </el-scrollbar>
    <div v-else class="flex h-[248px] items-center text-sm text-zinc-400">{{
      ShortcutsT('noCommands')
    }}</div>

    <template #footer>
      <div class="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <el-button
            :icon="Plus"
            type="primary"
            link
            :disabled="editingDisabled"
            @click="emit('add-command', folder)"
            >{{ ShortcutsT('addCommand') }}</el-button
          >
        </div>
        <div class="flex flex-shrink-0 items-center gap-2">
          <el-tooltip :content="ShortcutsT('openTerminal')" placement="top">
            <el-button
              :aria-label="ShortcutsT('openTerminal')"
              size="small"
              circle
              :disabled="editingDisabled"
              :loading="manager.isOpening(folder.id)"
              @click="manager.openFolderTerminal(folder.id)"
            >
              <template #icon>
                <yb-icon class="w-[1em] h-[1em]" :svg="import('@/svg/terminal.svg?raw')" />
              </template>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="ShortcutsT('editFolder')" placement="top">
            <el-button
              :icon="Edit"
              :aria-label="ShortcutsT('editFolder')"
              size="small"
              circle
              :disabled="editingDisabled"
              @click="emit('edit-folder', folder)"
            />
          </el-tooltip>
          <el-tooltip :content="ShortcutsT('deleteFolder')" placement="top">
            <el-button
              :icon="Delete"
              :aria-label="ShortcutsT('deleteFolder')"
              size="small"
              circle
              type="danger"
              plain
              :disabled="editingDisabled"
              @click="emit('remove-folder', folder)"
            />
          </el-tooltip>
        </div>
      </div>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { Delete, Edit, Plus, VideoPlay } from '@element-plus/icons-vue'
  import { ref, watch } from 'vue'
  import draggable from 'vuedraggable'
  import type { CommandFolder, PresetCommand } from '../shared'
  import { CommandShortcutsManager as manager } from './manager'
  import { ShortcutsT } from './lang'
  import FolderAvatar from './FolderAvatar.vue'

  const props = defineProps<{
    folder: CommandFolder
    reorderEnabled?: boolean
    editingDisabled?: boolean
    dragDisabled?: boolean
  }>()
  const emit = defineEmits<{
    'edit-folder': [folder: CommandFolder]
    'add-command': [folder: CommandFolder]
    'edit-command': [folder: CommandFolder, preset: PresetCommand]
    'remove-folder': [folder: CommandFolder]
    'remove-command': [folder: CommandFolder, preset: PresetCommand]
    dragging: [active: boolean]
  }>()
  const orderedCommands = ref<PresetCommand[]>([])
  const dragging = ref(false)
  watch(
    () => props.folder.commands,
    (commands) => {
      if (!dragging.value) orderedCommands.value = [...commands]
    },
    { immediate: true }
  )

  const startDrag = () => {
    dragging.value = true
    emit('dragging', true)
  }
  const persistCommandOrder = async () => {
    try {
      await manager.reorderCommands(
        props.folder.id,
        orderedCommands.value.map((preset) => preset.id)
      )
    } finally {
      orderedCommands.value = [
        ...(manager.folders.find((folder) => folder.id === props.folder.id)?.commands ?? [])
      ]
      dragging.value = false
      emit('dragging', false)
    }
  }
</script>

<style scoped>
  .command-shortcuts-card {
    height: 100%;
    min-width: 0;
  }
  .command-shortcuts-card :deep(.el-card__header) {
    padding-block: 12px;
  }
  .command-shortcuts-card :deep(.el-card__body) {
    min-height: 190px;
  }
  .command-shortcuts-command-actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }
  :deep(.command-shortcuts-command-ghost) {
    opacity: 0.35;
  }
</style>
