<template>
  <el-card class="cron-list-card">
    <div class="h-full overflow-hidden flex flex-col">
      <div class="toolbar flex-shrink-0">
        <el-input
          v-model="searchText"
          :placeholder="I18nT('common.action.search')"
          clearable
          class="search-input"
        />

        <el-select v-model="statusFilter" class="status-select">
          <el-option label="All" value="all" />
          <el-option label="Enabled" value="enabled" />
          <el-option label="Disabled" value="disabled" />
        </el-select>

        <el-button @click="resetFilter">Reset</el-button>
        <el-tag class="ml-auto" type="info"
          >{{ filteredJobs.length }} / {{ cronJobs.length }}</el-tag
        >
      </div>

      <el-table
        v-loading="loading"
        show-overflow-tooltip
        :data="filteredJobs"
        row-key="id"
        stripe
        class="cron-table flex-1"
      >
        <el-table-column prop="name" :width="160" :label="I18nT('cron.name')">
          <template #header>
            <span class="truncate">{{ I18nT('cron.name') }}</span>
          </template>
          <template #default="{ row }">
            <div class="job-name">
              <div class="name">{{ row.name }}</div>
              <div v-if="row.description" class="desc">{{ row.description }}</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          v-if="showHostColumn"
          prop="hostId"
          :label="I18nT('common.mcp.scope')"
          min-width="80"
        >
          <template #default="{ row }">
            <el-tag v-if="row.scope === 'global' || !row.hostId" type="info" effect="plain">
              {{ I18nT('cron.global') }}
            </el-tag>
            <span v-else class="truncate">{{ hostName(row.hostId) }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="schedule" :label="I18nT('cron.schedule')" width="160">
          <template #header>
            <span class="truncate">{{ I18nT('cron.schedule') }}</span>
          </template>
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" effect="light">{{
              row.schedule
            }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="command" :label="I18nT('cron.command')" show-overflow-tooltip>
          <template #header>
            <span class="truncate">{{ I18nT('cron.command') }}</span>
          </template>
          <template #default="{ row }">
            <div class="command-cell">
              <code>{{ row.command }}</code>
              <el-button text type="primary" size="small" @click="copyCommand(row.command)"
                >Copy</el-button
              >
            </div>
          </template>
        </el-table-column>

        <el-table-column
          prop="enabled"
          :label="I18nT('common.label.status')"
          width="100"
          align="center"
        >
          <template #default="{ row }">
            <div class="status-cell">
              <el-tooltip :content="jobStatusLabel(row)" placement="top">
                <el-icon class="status-icon" :class="jobStatusClass(row)">
                  <CircleCheckFilled v-if="jobStatusType(row) === 'success'" />
                  <CircleCloseFilled v-else-if="jobStatusType(row) === 'failed'" />
                  <VideoPause v-else />
                </el-icon>
              </el-tooltip>
              <el-switch v-model="row.enabled" @change="toggleCron(row)" />
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="I18nT('cron.lastRun')" width="200" align="center">
          <template #default="{ row }">
            <template v-if="row.lastRunTime">
              {{ formatTime(row.lastRunTime) }}
            </template>
            <template v-else>
              <span class="text-gray-400">{{ I18nT('cron.never') }}</span>
            </template>
          </template>
        </el-table-column>

        <el-table-column :label="I18nT('cron.nextRun')" width="200" align="center">
          <template #default="{ row }">
            <template v-if="row.nextRunTime">
              {{ formatTime(row.nextRunTime) }}
            </template>
            <template v-else>
              <span class="text-gray-400">-</span>
            </template>
          </template>
        </el-table-column>

        <el-table-column
          fixed="right"
          :label="I18nT('common.label.action')"
          width="100"
          align="center"
        >
          <template #default="{ row }">
            <el-popover
              effect="dark"
              popper-class="host-list-poper"
              placement="left-start"
              width="auto"
              :show-arrow="false"
            >
              <ul v-poper-fix class="host-list-menu">
                <li :class="{ disabled: !hasOutput(row) }" @click.stop="openOutput(row)">
                  <yb-icon :svg="import('@/svg/eye.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('cron.viewOutput') }}</span>
                </li>
                <li :class="{ disabled: runningJobId === row.id }" @click.stop="runJobIfIdle(row)">
                  <template v-if="runningJobId === row.id">
                    <el-button :loading="true" link>{{ I18nT('cron.runTest') }}</el-button>
                  </template>
                  <template v-else>
                    <yb-icon :svg="import('@/svg/play.svg?raw')" width="13" height="13" />
                    <span class="ml-3">{{ I18nT('cron.runTest') }}</span>
                  </template>
                </li>
                <li @click.stop="editCron(row)">
                  <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('common.action.edit') }}</span>
                </li>
                <li @click.stop="deleteCron(row)">
                  <yb-icon :svg="import('@/svg/trash.svg?raw')" width="13" height="13" />
                  <span class="ml-3">{{ I18nT('common.action.delete') }}</span>
                </li>
              </ul>

              <template #reference>
                <div class="right">
                  <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
                </div>
              </template>
            </el-popover>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty :description="I18nT('cron.tips')" />
        </template>
      </el-table>
    </div>
    <DialogOutput v-if="outputJob" :job="outputJob" @close="outputJob = null" />
  </el-card>
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
  import { CircleCheckFilled, CircleCloseFilled, VideoPause } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'
  import { MessageSuccess, MessageError } from '@/util/Element'
  import Base from '@/core/Base'
  import { AppStore } from '@/store/app'
  import type { CronJob } from '@shared/app'
  import DialogOutput from './DialogOutput.vue'
  import { useCronStore } from './store'

  const props = defineProps<{
    hostId?: number
    showHostColumn?: boolean
  }>()

  const emit = defineEmits<{
    edit: [item: CronJob]
    'stats-change': [stats: { total: number; enabled: number; disabled: number; recent: number }]
  }>()

  interface LoadDataOptions {
    force?: boolean
    silent?: boolean
  }

  const cronStore = useCronStore()
  const loading = ref(false)
  const cronJobs = computed(() => cronStore.getHostCronJobs(props.hostId))
  const searchText = ref('')
  const statusFilter = ref<'all' | 'enabled' | 'disabled'>('all')
  const runningJobId = ref<string | null>(null)
  const outputJob = ref<CronJob | null>(null)
  let pollTimer: number | undefined

  const filteredJobs = computed(() => {
    const keyword = searchText.value.trim().toLowerCase()
    return cronJobs.value.filter((item) => {
      const hitKeyword =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        item.command.toLowerCase().includes(keyword) ||
        item.schedule.toLowerCase().includes(keyword) ||
        hostName(item.hostId).toLowerCase().includes(keyword)

      const hitStatus =
        statusFilter.value === 'all' ||
        (statusFilter.value === 'enabled' && item.enabled) ||
        (statusFilter.value === 'disabled' && !item.enabled)

      return hitKeyword && hitStatus
    })
  })

  const emitStats = () => {
    const total = cronJobs.value.length
    const enabled = cronJobs.value.filter((item) => item.enabled).length
    const disabled = total - enabled
    const now = Date.now()
    const recent = cronJobs.value.filter((item) => {
      if (!item.updatedAt) {
        return false
      }
      return now - item.updatedAt < 24 * 60 * 60 * 1000
    }).length

    emit('stats-change', {
      total,
      enabled,
      disabled,
      recent
    })
  }

  const loadData = ({ force = false, silent = false }: LoadDataOptions = {}) => {
    if (!force && cronStore.hasHostCronJobs(props.hostId)) {
      emitStats()
      return
    }

    if (!silent) {
      loading.value = true
    }
    const args = typeof props.hostId === 'number' ? [props.hostId] : []
    IPC.send('app-fork:cron', 'getCronJobs', ...args).then((key: string, res: any) => {
      IPC.off(key)
      if (!silent) {
        loading.value = false
      }
      if (res?.code === 0) {
        cronStore.setHostCronJobs(props.hostId, res.data || [])
        emitStats()
      } else if (res?.code === 1) {
        MessageError(res.msg || 'Failed to load cron jobs')
      }
    })
  }

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString()
  }

  const copyCommand = (command: string) => {
    navigator.clipboard
      .writeText(command)
      .then(() => {
        MessageSuccess('Command copied')
      })
      .catch(() => {
        MessageError('Copy failed')
      })
  }

  const resetFilter = () => {
    searchText.value = ''
    statusFilter.value = 'all'
  }

  const rowHostId = (row: CronJob) => {
    return row.hostId ?? props.hostId ?? 0
  }

  const hostName = (hostId?: number) => {
    if (!hostId) {
      return I18nT('cron.global')
    }
    const host = AppStore().hosts.find((item) => item.id === hostId)
    return host?.name || `${I18nT('common.label.site')} #${hostId}`
  }

  const toggleCron = (row: CronJob) => {
    const previousEnabled = !row.enabled
    IPC.send('app-fork:cron', 'toggleCronJob', rowHostId(row), row.id, row.enabled).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.success'))
          if (res.data) {
            cronStore.upsertCronJob(res.data)
          }
          cronStore.clearSystemTasks()
        } else if (res?.code === 1) {
          row.enabled = previousEnabled
          MessageError(res.msg || 'Failed to toggle cron job')
        }
      }
    )
  }

  const editCron = (row: CronJob) => {
    emit('edit', row)
  }

  const runJob = (row: CronJob) => {
    const hostRoot = AppStore().hosts.find((h) => h.id === rowHostId(row))?.root ?? ''
    const workDir = row.workDir || hostRoot

    runningJobId.value = row.id

    IPC.send('app-fork:cron', 'runJobNow', rowHostId(row), row.id, workDir).then(
      (key: string, res: any) => {
        IPC.off(key)
        runningJobId.value = null

        if (res?.code === 0) {
          const result = res.data
          if (result?.exitCode === 0) {
            MessageSuccess(I18nT('cron.runSuccess'))
          } else {
            MessageError(result?.error || I18nT('cron.runFailed'))
          }
          outputJob.value = row
        } else {
          MessageError(res?.msg || I18nT('cron.runFailed'))
        }

        cronStore.clearAllCronJobs()
        loadData({ force: true, silent: true })
      }
    )
  }

  const deleteCron = (row: CronJob) => {
    Base._Confirm(I18nT('base.areYouSure'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        loading.value = true
        IPC.send('app-fork:cron', 'deleteCronJob', rowHostId(row), row.id).then(
          (key: string, res: any) => {
            IPC.off(key)
            loading.value = false
            if (res?.code === 0) {
              MessageSuccess(I18nT('base.success'))
              cronStore.clearAllCronJobs()
              cronStore.clearSystemTasks()
              loadData({ force: true })
            } else if (res?.code === 1) {
              MessageError(res.msg || 'Failed to delete cron job')
            }
          }
        )
      })
      .catch(() => {})
  }

  const hasOutput = (row: CronJob) => {
    return Boolean(row.lastRunTime)
  }

  const openOutput = (row: CronJob) => {
    if (!hasOutput(row)) {
      return
    }
    outputJob.value = row
  }

  const runJobIfIdle = (row: CronJob) => {
    if (runningJobId.value === row.id) {
      return
    }
    runJob(row)
  }

  const jobStatusType = (row: CronJob): 'success' | 'failed' | 'paused' => {
    if (!row.enabled) {
      return 'paused'
    }
    if (row.systemRegistered === false || row.systemError) {
      return 'failed'
    }
    if (typeof row.lastExitCode === 'number') {
      return row.lastExitCode === 0 ? 'success' : 'failed'
    }
    return 'paused'
  }

  const jobStatusLabel = (row: CronJob): string => {
    if (row.systemError) {
      return row.systemError
    }
    const type = jobStatusType(row)
    if (type === 'success') {
      return I18nT('cron.runSuccess')
    }
    if (type === 'failed') {
      return I18nT('cron.runFailed')
    }
    return row.enabled ? I18nT('cron.never') : 'Paused'
  }

  const jobStatusClass = (row: CronJob) => {
    const type = jobStatusType(row)
    return {
      success: type === 'success',
      failed: type === 'failed',
      paused: type === 'paused'
    }
  }

  onMounted(() => {
    loadData()
    pollTimer = window.setInterval(() => {
      loadData({ force: true, silent: true })
    }, 20000)
  })

  onUnmounted(() => {
    if (pollTimer) {
      window.clearInterval(pollTimer)
      pollTimer = undefined
    }
  })

  watch(
    () => cronJobs.value,
    () => emitStats(),
    { deep: true, immediate: true }
  )

  watch(
    () => props.hostId,
    () => loadData()
  )

  defineExpose({
    loadData
  })
</script>

<style scoped lang="scss">
  .cron-list-card {
    height: 100%;

    .toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 12px;
      border-bottom: 1px solid var(--el-border-color-lighter);
      background: linear-gradient(
        180deg,
        var(--el-fill-color-light) 0%,
        var(--el-bg-color-overlay) 100%
      );

      .search-input {
        width: 280px;
      }

      .status-select {
        width: 140px;
      }
    }

    .cron-table {
      :deep(.el-table__cell) {
        vertical-align: middle;
      }
    }

    .job-name {
      .name {
        font-weight: 600;
      }

      .desc {
        margin-top: 4px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    .command-cell {
      display: flex;
      align-items: center;
      gap: 8px;

      code {
        display: inline-block;
        max-width: 220px;
        padding: 2px 6px;
        border-radius: 6px;
        background: var(--el-fill-color-light);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .status-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;

      .status-icon {
        font-size: 16px;

        &.success {
          color: var(--el-color-success);
        }

        &.failed {
          color: var(--el-color-danger);
        }

        &.paused {
          color: var(--el-text-color-secondary);
        }
      }
    }

    .right {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 34px;
      margin: 0 auto;
      border-radius: 7px;
      cursor: pointer;

      &:hover {
        color: #fdab1f;
      }
    }

    :deep(.el-card__body) {
      height: 100%;
      padding: 0;
    }
  }

  @media (max-width: 920px) {
    .cron-list-card {
      .toolbar {
        flex-wrap: wrap;

        .search-input {
          width: 100%;
        }
      }
    }
  }
</style>
