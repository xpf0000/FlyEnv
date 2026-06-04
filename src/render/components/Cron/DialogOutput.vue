<template>
  <el-dialog
    v-model="visible"
    :title="I18nT('cron.runOutput')"
    width="85%"
    destroy-on-close
    class="el-dialog-content-flex-1 h-[75%] dark:bg-[#1d2033]"
    @close="handleClose"
  >
    <el-auto-resizer>
      <template #default="{ width }">
        <el-descriptions
          v-if="dialogData"
          class="h-full overflow-hidden mb-3"
          :column="1"
          border
          size="small"
          direction="vertical"
        >
          <el-descriptions-item :label="I18nT('cron.name')">
            {{ dialogData.name }}
          </el-descriptions-item>
          <el-descriptions-item :label="I18nT('cron.command')">
            {{ dialogData.command }}
          </el-descriptions-item>
          <el-descriptions-item :label="I18nT('cron.runHistory')">
            <el-auto-resizer>
              <template #default="{ height }">
                <el-table-v2
                  class="app-el-table-v2 max-w-full"
                  :columns="historyColumns"
                  :data="history"
                  :width="width"
                  :height="height"
                  :header-height="59"
                  :row-height="59"
                />
              </template>
            </el-auto-resizer>
          </el-descriptions-item>
        </el-descriptions>
      </template>
    </el-auto-resizer>
  </el-dialog>
</template>

<script setup lang="tsx">
  import { ref, onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'
  import { ElTag } from 'element-plus'
  import type { Column } from 'element-plus'
  import type { CronJob, CronRunRecord } from '@shared/app'

  const props = defineProps<{
    job: CronJob
    runtimeOutput?: { output: string; error: string; exitCode: number; duration: number }
  }>()

  const emit = defineEmits<{
    close: []
  }>()

  const visible = ref(true)

  const dialogData = ref<{ name: string; command: string } | null>(null)

  const history = ref<CronRunRecord[]>([])

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString()
  }

  const loadHistory = () => {
    IPC.send('app-fork:cron', 'listRunRecords', props.job.id, 20).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        history.value = [...(res.data || [])].reverse()
      }
    })
  }

  const historyColumns: Column<CronRunRecord>[] = [
    {
      key: 'exitCode',
      title: I18nT('cron.exitCode'),
      dataKey: 'exitCode',
      width: 100,
      align: 'center',
      cellRenderer: ({ rowData }) => {
        return (
          <ElTag size="small" type={rowData.exitCode === 0 ? 'success' : 'danger'}>
            {rowData.exitCode}
          </ElTag>
        )
      }
    },
    {
      key: 'finishedAt',
      title: I18nT('cron.runAt'),
      dataKey: 'finishedAt',
      width: 220,
      cellRenderer: ({ rowData }) => {
        return <span>{formatTime(rowData.finishedAt)}</span>
      }
    },
    {
      key: 'duration',
      title: I18nT('cron.duration'),
      dataKey: 'duration',
      width: 160,
      cellRenderer: ({ rowData }) => {
        return <span>{rowData.duration}ms</span>
      }
    },
    {
      key: 'output',
      title: 'STDOUT',
      dataKey: 'output',
      class: 'flex-1',
      headerClass: 'flex-1',
      width: 0,
      cellRenderer: ({ rowData }) => {
        return (
          <div class="max-h-[60px] overflow-y-auto whitespace-pre-wrap break-all text-xs m-0 font-[Consolas,'Courier_New',monospace]">
            {rowData.output || '-'}
          </div>
        )
      }
    },
    {
      key: 'error',
      title: 'STDERR',
      dataKey: 'error',
      class: 'flex-1',
      headerClass: 'flex-1',
      width: 0,
      cellRenderer: ({ rowData }) => {
        return (
          <div class="max-h-[60px] overflow-y-auto whitespace-pre-wrap break-all text-xs m-0 font-[Consolas,'Courier_New',monospace]">
            {rowData.error || '-'}
          </div>
        )
      }
    }
  ]

  const handleClose = () => {
    visible.value = false
    setTimeout(() => {
      emit('close')
    }, 200)
  }

  onMounted(() => {
    dialogData.value = {
      name: props.job.name,
      command: props.job.command
    }
    loadHistory()
  })
</script>
<style lang="scss" scoped>
  .el-descriptions {
    :deep(.el-descriptions__body) {
      height: 100%;

      .el-descriptions__table {
        height: 100%;
      }
    }
  }
</style>
