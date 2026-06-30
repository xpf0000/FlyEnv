<template>
  <el-card
    class="flex h-full flex-col [&_.el-card__body]:flex [&_.el-card__body]:h-full [&_.el-card__body]:min-h-0 [&_.el-card__body]:flex-col [&_.el-card__body]:gap-3"
  >
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <el-input
        v-model="searchText"
        :placeholder="I18nT('common.action.search')"
        clearable
        class="w-full md:w-[280px]"
      />

      <el-select v-model="taskFilter" class="w-full md:w-[160px]">
        <el-option :label="I18nT('cron.allTasks')" value="all" />
        <el-option :label="I18nT('cron.flyenvTask')" value="flyenv" />
        <el-option :label="I18nT('cron.otherTask')" value="other" />
      </el-select>

      <el-button :icon="Refresh" @click="loadData({ force: true })">
        {{ I18nT('common.action.refresh') }}
      </el-button>

      <el-tag class="ml-auto" type="info">{{ filteredTasks.length }} / {{ tasks.length }}</el-tag>
    </div>

    <el-table
      v-loading="loading"
      show-overflow-tooltip
      :data="filteredTasks"
      row-key="id"
      stripe
      class="min-h-0 flex-1 [&_.cell]:overflow-hidden [&_.cell]:text-ellipsis [&_.cell]:whitespace-nowrap"
    >
      <el-table-column prop="name" :label="I18nT('cron.name')" min-width="180">
        <template #default="{ row }">
          <div class="min-w-0 truncate whitespace-nowrap">
            <span>{{ taskName(row) }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column :label="I18nT('common.label.source')" width="130" align="center">
        <template #default="{ row }">
          <el-tag
            :type="row.isFlyEnv ? 'success' : 'info'"
            effect="plain"
            class="max-w-full truncate whitespace-nowrap"
          >
            {{ row.isFlyEnv ? I18nT('cron.flyenvTask') : I18nT('cron.systemTask') }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="schedule" :label="I18nT('cron.taskTrigger')" min-width="220">
        <template #default="{ row }">
          <code class="block truncate whitespace-nowrap font-mono text-xs">
            {{ row.schedule || '-' }}
          </code>
        </template>
      </el-table-column>

      <el-table-column prop="nextRunTime" :label="I18nT('cron.nextRun')" width="190" align="center">
        <template #default="{ row }">
          <span v-if="row.nextRunTime" class="block truncate whitespace-nowrap">
            {{ formatTime(row.nextRunTime) }}
          </span>
          <span v-else class="block truncate whitespace-nowrap text-gray-400">-</span>
        </template>
      </el-table-column>

      <el-table-column prop="command" :label="I18nT('cron.command')" min-width="280">
        <template #default="{ row }">
          <code class="block truncate whitespace-nowrap font-mono text-xs">
            {{ row.command || '-' }}
          </code>
        </template>
      </el-table-column>

      <el-table-column
        fixed="right"
        :label="I18nT('common.label.action')"
        width="80"
        align="center"
      >
        <template #default="{ row }">
          <el-button :icon="Delete" link type="danger" @click="deleteTask(row)" />
        </template>
      </el-table-column>

      <template #empty>
        <el-empty :description="I18nT('cron.noSystemTasks')" />
      </template>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { Delete, Refresh } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'
  import Base from '@/core/Base'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import type { SystemScheduledTask } from '@shared/app'
  import { useCronStore } from './store'

  interface LoadDataOptions {
    force?: boolean
  }

  const cronStore = useCronStore()
  const loading = ref(false)
  const tasks = computed(() => cronStore.systemTasks)
  const searchText = ref('')
  const taskFilter = ref<'all' | 'flyenv' | 'other'>('all')

  const filteredTasks = computed(() => {
    const keyword = searchText.value.trim().toLowerCase()
    return tasks.value.filter((item) => {
      const hitTaskType =
        taskFilter.value === 'all' ||
        (taskFilter.value === 'flyenv' && item.isFlyEnv) ||
        (taskFilter.value === 'other' && !item.isFlyEnv)

      const content = [
        item.name,
        item.fullName,
        item.path,
        item.schedule,
        item.nextRunTime ? formatTime(item.nextRunTime) : '',
        item.command,
        item.description,
        item.author
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return hitTaskType && (!keyword || content.includes(keyword))
    })
  })

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString()
  }

  const taskName = (row: SystemScheduledTask): string => {
    if (row.isFlyEnv) {
      return row.name || row.fullName || '-'
    }
    return row.fullName || row.name || '-'
  }

  const loadData = ({ force = false }: LoadDataOptions = {}) => {
    if (!force && cronStore.systemTasksLoaded) {
      return
    }

    loading.value = true
    IPC.send('app-fork:cron', 'listSystemTasks').then((key: string, res: any) => {
      IPC.off(key)
      loading.value = false
      if (res?.code === 0) {
        cronStore.setSystemTasks(res.data || [])
      } else {
        MessageError(res?.msg || 'Failed to load system tasks')
      }
    })
  }

  const deleteTask = (row: SystemScheduledTask) => {
    Base._Confirm(`${I18nT('cron.deleteSystemTaskTips')}\n${row.fullName || row.name}`)
      .then(() => {
        loading.value = true
        IPC.send('app-fork:cron', 'deleteSystemTask', row.id).then((key: string, res: any) => {
          IPC.off(key)
          loading.value = false
          if (res?.code === 0) {
            MessageSuccess(I18nT('base.success'))
            cronStore.clearAllCronJobs()
            loadData({ force: true })
          } else {
            MessageError(res?.msg || 'Failed to delete system task')
          }
        })
      })
      .catch(() => {})
  }

  onMounted(() => {
    loadData()
  })

  defineExpose({
    loadData
  })
</script>
