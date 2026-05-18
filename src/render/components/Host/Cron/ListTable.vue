<template>
  <el-card class="cron-list-card">
    <div class="toolbar">
      <el-input
        v-model="searchText"
        :placeholder="I18nT('base.placeholderSearch')"
        clearable
        class="search-input"
      />

      <el-select v-model="statusFilter" class="status-select">
        <el-option label="All" value="all" />
        <el-option label="Enabled" value="enabled" />
        <el-option label="Disabled" value="disabled" />
      </el-select>

      <el-button @click="resetFilter">Reset</el-button>
      <el-tag class="ml-auto" type="info">{{ filteredJobs.length }} / {{ cronJobs.length }}</el-tag>
    </div>

    <el-table v-loading="loading" :data="filteredJobs" row-key="id" stripe class="cron-table">
      <el-table-column prop="name" :label="I18nT('cron.name')" min-width="190">
        <template #default="{ row }">
          <div class="job-name">
            <div class="name">{{ row.name }}</div>
            <div v-if="row.description" class="desc">{{ row.description }}</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column prop="schedule" :label="I18nT('cron.schedule')" min-width="120">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" effect="light">{{ row.schedule }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="command" :label="I18nT('cron.command')" min-width="280" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="command-cell">
            <code>{{ row.command }}</code>
            <el-button text type="primary" size="small" @click="copyCommand(row.command)">Copy</el-button>
          </div>
        </template>
      </el-table-column>

      <el-table-column prop="enabled" :label="I18nT('cron.status')" width="100" align="center">
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

      <el-table-column :label="I18nT('cron.lastRun')" width="180" align="center">
        <template #default="{ row }">
          <template v-if="row.lastRunTime">
            {{ formatTime(row.lastRunTime) }}
          </template>
          <template v-else>
            <span class="text-gray-400">{{ I18nT('cron.never') }}</span>
          </template>
        </template>
      </el-table-column>

      <el-table-column :label="I18nT('cron.nextRun')" width="180" align="center">
        <template #default="{ row }">
          <template v-if="row.nextRunTime">
            {{ formatTime(row.nextRunTime) }}
          </template>
          <template v-else>
            <span class="text-gray-400">-</span>
          </template>
        </template>
      </el-table-column>

      <el-table-column :label="I18nT('base.action')" width="170" align="center">
        <template #default="{ row }">
          <div class="action-icons">
            <el-tooltip :content="I18nT('cron.viewOutput')" placement="top">
              <el-button type="info" link :disabled="!hasOutput(row)" @click="openOutputDialog(row)">
                <el-icon><View /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip :content="I18nT('cron.runTest')" placement="top">
              <el-button type="warning" link :loading="runningJobId === row.id" @click="runJob(row)">
                <el-icon><VideoPlay /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip :content="I18nT('base.edit')" placement="top">
              <el-button type="primary" link @click="editCron(row)">
                <el-icon><Edit /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip :content="I18nT('base.del')" placement="top">
              <el-button type="danger" link @click="deleteCron(row)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
          <div v-if="outputMap[row.id]" class="inline-output">
            <div class="inline-output-meta">
              <el-tag :type="outputMap[row.id].exitCode === 0 ? 'success' : 'danger'" size="small">
                {{ outputMap[row.id].exitCode === 0 ? I18nT('cron.runSuccess') : I18nT('cron.runFailed') }}
              </el-tag>
              <span class="ml-1 text-xs">{{ outputMap[row.id].duration }}ms</span>
              <el-button text size="small" @click="delete outputMap[row.id]" class="ml-auto">✕</el-button>
            </div>
            <pre class="inline-output-pre">{{ outputMap[row.id].output || outputMap[row.id].error || I18nT('cron.noOutput') }}</pre>
          </div>
        </template>
      </el-table-column>

      <template #empty>
        <el-empty :description="I18nT('cron.tips')" />
      </template>
    </el-table>

    <el-dialog
      v-model="outputDialogVisible"
      :title="I18nT('cron.runOutput')"
      width="760px"
      destroy-on-close
      class="output-view-dialog"
    >
      <div v-if="outputDialogData" class="output-dialog-body">
        <div class="output-summary">
          <div><strong>{{ I18nT('cron.name') }}:</strong> {{ outputDialogData.name }}</div>
          <div><strong>{{ I18nT('cron.command') }}:</strong> {{ outputDialogData.command }}</div>
          <div>
            <strong>{{ I18nT('cron.exitCode') }}:</strong>
            <el-tag size="small" :type="outputDialogData.exitCode === 0 ? 'success' : 'danger'">
              {{ outputDialogData.exitCode ?? '-' }}
            </el-tag>
          </div>
          <div v-if="outputDialogData.duration !== undefined">
            <strong>{{ I18nT('cron.duration') }}:</strong> {{ outputDialogData.duration }}ms
          </div>
          <div v-if="outputDialogData.lastRunTime">
            <strong>{{ I18nT('cron.runAt') }}:</strong> {{ formatTime(outputDialogData.lastRunTime) }}
          </div>
        </div>

        <div class="output-panels">
          <div class="output-panel">
            <div class="panel-title">STDOUT</div>
            <pre>{{ outputDialogData.output || I18nT('cron.noOutput') }}</pre>
          </div>
          <div class="output-panel">
            <div class="panel-title">STDERR</div>
            <pre>{{ outputDialogData.error || I18nT('cron.noOutput') }}</pre>
          </div>
        </div>
      </div>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
  import { CircleCheckFilled, CircleCloseFilled, VideoPause, VideoPlay, Edit, Delete, View } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'
  import { MessageSuccess, MessageError } from '@/util/Element'
  import Base from '@/core/Base'
  import { AppStore } from '@/store/app'
  import type { CronJob } from '@shared/app'

  const props = defineProps<{
    hostId: number
  }>()

  const emit = defineEmits<{
    edit: [item: CronJob]
    'stats-change': [stats: { total: number; enabled: number; disabled: number; recent: number }]
  }>()

  const loading = ref(false)
  const cronJobs = ref<CronJob[]>([])
  const searchText = ref('')
  const statusFilter = ref<'all' | 'enabled' | 'disabled'>('all')
  const runningJobId = ref<string | null>(null)
  const outputMap = ref<Record<string, { output: string; error: string; exitCode: number; duration: number }>>({})
  const outputDialogVisible = ref(false)
  const outputDialogData = ref<{
    name: string
    command: string
    output: string
    error: string
    exitCode?: number
    duration?: number
    lastRunTime?: number
  } | null>(null)
  let pollTimer: number | undefined

  const filteredJobs = computed(() => {
    const keyword = searchText.value.trim().toLowerCase()
    return cronJobs.value.filter((item) => {
      const hitKeyword = !keyword
        || item.name.toLowerCase().includes(keyword)
        || item.command.toLowerCase().includes(keyword)
        || item.schedule.toLowerCase().includes(keyword)

      const hitStatus =
        statusFilter.value === 'all'
        || (statusFilter.value === 'enabled' && item.enabled)
        || (statusFilter.value === 'disabled' && !item.enabled)

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

  const loadData = (silent = false) => {
    if (!silent) {
      loading.value = true
    }
    IPC.send('app-fork:cron', 'getCronJobs', props.hostId).then((key: string, res: any) => {
      IPC.off(key)
      if (!silent) {
        loading.value = false
      }
      if (res?.code === 0) {
        cronJobs.value = res.data || []
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

  const toggleCron = (row: CronJob) => {
    IPC.send('app-fork:cron', 'toggleCronJob', props.hostId, row.id, row.enabled).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.operationSuccess'))
          loadData(true)
        } else if (res?.code === 1) {
          MessageError(res.msg || 'Failed to toggle cron job')
          loadData()
        }
      }
    )
  }

  const editCron = (row: CronJob) => {
    emit('edit', row)
  }

  const runJob = (row: CronJob) => {
    const hostRoot = AppStore().hosts.find((h) => h.id === props.hostId)?.root ?? ''
    runningJobId.value = row.id
    IPC.send('app-fork:cron', 'runJobNow', props.hostId, row.id, row.workDir || hostRoot).then(
      (key: string, res: any) => {
        IPC.off(key)
        runningJobId.value = null
        if (res?.code === 0) {
          outputMap.value[row.id] = res.data
          loadData()
        } else {
          outputMap.value[row.id] = { output: '', error: res?.msg || 'Failed', exitCode: 1, duration: 0 }
        }
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
        IPC.send('app-fork:cron', 'deleteCronJob', props.hostId, row.id).then(
          (key: string, res: any) => {
            IPC.off(key)
            loading.value = false
            if (res?.code === 0) {
              MessageSuccess(I18nT('base.operationSuccess'))
              loadData()
            } else if (res?.code === 1) {
              MessageError(res.msg || 'Failed to delete cron job')
            }
          }
        )
      })
      .catch(() => {})
  }

  const hasOutput = (row: CronJob) => {
    const runtimeOutput = outputMap.value[row.id]
    return Boolean(runtimeOutput || row.lastOutput || row.lastError)
  }

  const openOutputDialog = (row: CronJob) => {
    const runtimeOutput = outputMap.value[row.id]
    outputDialogData.value = {
      name: row.name,
      command: row.command,
      output: runtimeOutput?.output ?? row.lastOutput ?? '',
      error: runtimeOutput?.error ?? row.lastError ?? '',
      exitCode: runtimeOutput?.exitCode ?? row.lastExitCode,
      duration: runtimeOutput?.duration,
      lastRunTime: row.lastRunTime
    }
    outputDialogVisible.value = true
  }

  const jobStatusType = (row: CronJob): 'success' | 'failed' | 'paused' => {
    if (!row.enabled) {
      return 'paused'
    }
    if (typeof row.lastExitCode === 'number') {
      return row.lastExitCode === 0 ? 'success' : 'failed'
    }
    return 'paused'
  }

  const jobStatusLabel = (row: CronJob): string => {
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
      loadData(true)
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
    { deep: true }
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
      background: linear-gradient(180deg, var(--el-fill-color-light) 0%, var(--el-bg-color-overlay) 100%);

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

    .action-icons {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .output-dialog-body {
      .output-summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 14px;
        margin-bottom: 12px;
        font-size: 12px;
      }

      .output-panels {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;

        .output-panel {
          border: 1px solid var(--el-border-color-lighter);
          border-radius: 8px;
          overflow: hidden;

          .panel-title {
            padding: 8px 10px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.4px;
            background: var(--el-fill-color-light);
            border-bottom: 1px solid var(--el-border-color-lighter);
          }

          pre {
            margin: 0;
            padding: 10px;
            max-height: 180px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
            font-size: 12px;
            font-family: 'Consolas', 'Courier New', monospace;
            background: var(--el-bg-color-overlay);
          }
        }
      }
    }

    :deep(.el-card__body) {
      height: 100%;
      padding: 0;
    }

    .inline-output {
      margin-top: 6px;
      text-align: left;

      .inline-output-meta {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        margin-bottom: 4px;
      }

      .inline-output-pre {
        background: var(--el-fill-color);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: 6px;
        padding: 6px 8px;
        font-size: 11px;
        font-family: 'Consolas', 'Courier New', monospace;
        max-height: 100px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-all;
        margin: 0;
      }
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
