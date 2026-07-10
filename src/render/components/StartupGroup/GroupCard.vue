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
        <el-tag :type="statusType" effect="plain">{{ statusLabel }}</el-tag>
      </div>
    </template>

    <div class="flex flex-col gap-4">
      <div class="flex gap-5 text-sm text-zinc-500">
        <span>{{ I18nT('common.startupGroup.memberCount') }}: {{ group.items.length }}</span>
        <span>{{ I18nT('common.startupGroup.runningCount') }}: {{ runningCount }}</span>
      </div>

      <div class="min-h-12 text-sm">
        <template v-if="memberLabels.length">
          <el-tag
            v-for="label in memberLabels.slice(0, 3)"
            :key="label"
            class="mr-2 mb-2 max-w-full"
            effect="plain"
          >
            <span class="inline-block max-w-52 truncate align-middle">{{ label }}</span>
          </el-tag>
          <el-tag v-if="memberLabels.length > 3" class="mb-2" type="info" effect="plain">
            +{{ memberLabels.length - 3 }}
          </el-tag>
        </template>
        <span v-else class="text-zinc-400">{{ I18nT('common.startupGroup.emptyMembers') }}</span>
      </div>

      <div class="flex flex-wrap gap-2">
        <el-button type="primary" :disabled="startDisabled" @click="emit('start', group)">
          {{ I18nT('common.action.start') }}
        </el-button>
        <el-button :disabled="stopDisabled" @click="emit('stop', group)">
          {{ I18nT('common.action.stop') }}
        </el-button>
        <el-button @click="emit('edit', group)">{{ I18nT('common.action.edit') }}</el-button>
        <el-button type="danger" plain @click="emit('delete', group)">
          {{ I18nT('common.action.delete') }}
        </el-button>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between">
        <span>{{ I18nT('common.startupGroup.default') }}</span>
        <el-switch :model-value="isDefault" :disabled="defaultDisabled" @change="defaultChange" />
      </div>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'

  import { I18nT } from '@lang/index'
  import type { StartupGroup, StartupGroupCardState } from '@/core/StartupGroup'

  const props = defineProps<{
    group: StartupGroup
    state: StartupGroupCardState
    runningCount: number
    memberLabels: string[]
    isDefault: boolean
    busy: boolean
  }>()

  const emit = defineEmits<{
    start: [group: StartupGroup]
    stop: [group: StartupGroup]
    edit: [group: StartupGroup]
    delete: [group: StartupGroup]
    'default-change': [group: StartupGroup, enabled: boolean]
  }>()

  const statusLabel = computed(() => I18nT(`common.startupGroup.state.${props.state}`))
  const statusType = computed(() => {
    if (props.state === 'running') return 'success'
    if (props.state === 'invalid') return 'danger'
    if (props.state === 'executing' || props.state === 'partial-running') return 'warning'
    return 'info'
  })
  const startDisabled = computed(
    () => props.busy || props.state === 'running' || props.state === 'executing'
  )
  const stopDisabled = computed(
    () => props.busy || props.state === 'stopped' || props.state === 'executing'
  )
  const defaultDisabled = computed(
    () => props.busy || props.group.items.length === 0 || props.state === 'executing'
  )

  const defaultChange = (value: string | number | boolean) => {
    emit('default-change', props.group, value === true)
  }
</script>

<style scoped lang="scss">
  .startup-group-card {
    height: 100%;

    :deep(.el-card__body) {
      min-height: 190px;
    }
  }
</style>
