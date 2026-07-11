<template>
  <el-card class="startup-group-card" shadow="hover">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span
              class="inline-block h-3 w-3 rounded-full"
              :style="{ backgroundColor: group.color || '#409eff' }"
            ></span>
            <strong class="truncate text-base">{{ group.name }}</strong>
          </div>
          <div v-if="group.description" class="mt-1 truncate text-xs text-zinc-500">
            {{ group.description }}
          </div>
        </div>
        <el-switch
          class="flex-shrink-0"
          :model-value="groupRunning"
          :disabled="groupDisabled"
          :before-change="groupBeforeChange"
        />
      </div>
    </template>

    <el-scrollbar v-if="group.items.length" height="248px">
      <div class="flex flex-col gap-2 pr-2">
        <div
          v-for="item in group.items"
          :key="item.id"
          class="flex h-14 items-center justify-between gap-3 rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700"
        >
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">
              {{ memberDisplayTitle(item) }}
            </div>
            <div class="mt-1 truncate text-xs text-zinc-500">
              {{ memberPath(item) }}
            </div>
          </div>
          <el-switch
            :model-value="memberRunning(item)"
            :disabled="StartupGroupSetup.isMemberDisabled(group, item)"
            :before-change="() => memberBeforeChange(item)"
          />
        </div>
      </div>
    </el-scrollbar>
    <div v-else class="flex h-[248px] items-center text-sm text-zinc-400">
      {{ I18nT('common.startupGroup.emptyMembers') }}
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <el-tooltip
          :content="I18nT('common.startupGroup.defaultTooltip')"
          placement="top"
          :show-after="600"
        >
          <el-checkbox :model-value="isDefault" :disabled="defaultDisabled" @change="defaultChange">
            {{ I18nT('common.startupGroup.default') }}
          </el-checkbox>
        </el-tooltip>
        <div class="flex items-center gap-2">
          <el-tooltip :content="I18nT('common.action.edit')" placement="top">
            <el-button :icon="Edit" size="small" circle @click="emit('edit', group)" />
          </el-tooltip>
          <el-tooltip :content="I18nT('common.action.delete')" placement="top">
            <el-button
              :icon="Delete"
              size="small"
              circle
              type="danger"
              plain
              @click="emit('delete', group)"
            />
          </el-tooltip>
        </div>
      </div>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { Delete, Edit } from '@element-plus/icons-vue'
  import { computed } from 'vue'

  import { I18nT } from '@lang/index'
  import type { StartupGroup, StartupGroupItem } from '@/core/StartupGroup'
  import { StartupGroupSetup } from './setup'

  const props = defineProps<{
    group: StartupGroup
    isDefault: boolean
  }>()

  const emit = defineEmits<{
    'group-change': [group: StartupGroup, enabled: boolean]
    'member-change': [group: StartupGroup, item: StartupGroupItem, enabled: boolean]
    edit: [group: StartupGroup]
    delete: [group: StartupGroup]
    'default-change': [group: StartupGroup, enabled: boolean]
  }>()

  const groupRunning = computed(() => StartupGroupSetup.isGroupRunning(props.group))
  const groupDisabled = computed(
    () =>
      StartupGroupSetup.busy ||
      StartupGroupSetup.isGroupExecuting(props.group) ||
      props.group.items.length === 0
  )
  const defaultDisabled = computed(() => StartupGroupSetup.busy || props.group.items.length === 0)

  const memberPath = (item: StartupGroupItem) => StartupGroupSetup.getMemberPath(item)
  const memberDisplayTitle = (item: StartupGroupItem) =>
    StartupGroupSetup.getMemberDisplayTitle(item, I18nT('common.startupGroup.noRemark'))
  const memberRunning = (item: StartupGroupItem) => StartupGroupSetup.isMemberRunning(item)
  const groupBeforeChange = () => {
    emit('group-change', props.group, !groupRunning.value)
    return false
  }
  const memberBeforeChange = (item: StartupGroupItem) => {
    emit('member-change', props.group, item, !memberRunning(item))
    return false
  }
  const defaultChange = (value: string | number | boolean) =>
    emit('default-change', props.group, value === true)
</script>

<style scoped lang="scss">
  .startup-group-card {
    height: 100%;

    :deep(.el-card__body) {
      min-height: 190px;
    }
  }
</style>
