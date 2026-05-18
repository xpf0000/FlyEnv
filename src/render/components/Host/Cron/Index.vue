<template>
  <el-drawer
    v-model="show"
    size="82%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="cron-index-panel">
      <div class="page-header">
        <div class="close-btn" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" />
        </div>

        <div class="header-content">
          <div class="page-title">{{ I18nT('cron.title') }}</div>
          <div class="page-subtitle">{{ I18nT('cron.tips') }}</div>

          <div class="stat-row">
            <div class="stat-box">
              <div class="stat-label">{{ tCron('total', 'Total') }}</div>
              <div class="stat-value">{{ stats.total }}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">{{ tCron('enabled', 'Enabled') }}</div>
              <div class="stat-value enabled">{{ stats.enabled }}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">{{ tCron('disabled', 'Disabled') }}</div>
              <div class="stat-value">{{ stats.disabled }}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">{{ tCron('updated24h', 'Updated 24h') }}</div>
              <div class="stat-value">{{ stats.recent }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="main-wapper flex-1">
        <div class="top-bar flex items-center gap-2.5 p-3">
          <el-button @click="toAdd" type="primary" class="action-btn">
            <Plus class="w-5 h-5" />
            {{ I18nT('cron.add') }}
          </el-button>
          <el-button @click="refreshList" class="action-btn secondary">
            <Refresh class="w-5 h-5" />
            {{ I18nT('base.refresh') }}
          </el-button>
        </div>

        <ListTable
          :hostId="hostId"
          ref="listTableRef"
          @edit="onEdit"
          @stats-change="onStatsChange"
        />
      </div>

      <DialogAdd
        v-if="showDialog"
        :hostId="hostId"
        :item="editingItem"
        @refresh="refreshList"
        @close="showDialog = false"
      />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { Plus, Refresh } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import ListTable from './ListTable.vue'
  import DialogAdd from './DialogAdd.vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import type { CronJob } from '@shared/app'

  const props = defineProps<{
    hostId: number
  }>()

  const showDialog = ref(false)
  const editingItem = ref<CronJob | null>(null)
  const listTableRef = ref<InstanceType<typeof ListTable>>()
  const stats = ref({
    total: 0,
    enabled: 0,
    disabled: 0,
    recent: 0
  })

  const { show, onClosed, closedFn } = AsyncComponentSetup()

  const tCron = (key: string, fallback: string) => {
    const value = I18nT(`cron.${key}`)
    if (!value) {
      return fallback
    }

    const normalized = `${value}`.trim().toLowerCase()
    if (normalized === `cron.${key}` || normalized === `cron_${key}`) {
      return fallback
    }

    return value
  }

  const toAdd = () => {
    editingItem.value = null
    showDialog.value = true
  }

  const onEdit = (item: CronJob) => {
    editingItem.value = item
    showDialog.value = true
  }

  const onStatsChange = (payload: {
    total: number
    enabled: number
    disabled: number
    recent: number
  }) => {
    stats.value = payload
  }

  const refreshList = () => {
    listTableRef.value?.loadData()
  }

  defineExpose({
    show,
    onClosed,
    closedFn
  })
</script>


<style scoped lang="scss">
  .cron-index-panel {
    height: 100%;
    display: flex;
    flex-direction: column;

    .page-header {
      flex-shrink: 0;
      border-bottom: 1px solid var(--el-border-color-lighter);
      position: relative;

      .close-btn {
        position: absolute;
        top: 10px;
        left: 10px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s;
        z-index: 10;

        svg {
          width: 16px;
          height: 16px;
        }

        &:hover {
          background: var(--el-fill-color-light);
        }
      }

      .header-content {
        padding: 50px 16px 14px;

        .page-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--el-text-color-primary);
        }

        .page-subtitle {
          margin-top: 3px;
          font-size: 12px;
          color: var(--el-text-color-secondary);
          margin-bottom: 12px;
        }

        .stat-row {
          display: flex;
          gap: 10px;

          .stat-box {
            flex: 1;
            border: 1px solid var(--el-border-color-lighter);
            border-radius: 8px;
            padding: 8px 12px;
            background: var(--el-fill-color-light);
            min-width: 80px;

            .stat-label {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.6px;
              color: var(--el-text-color-secondary);
            }

            .stat-value {
              margin-top: 4px;
              font-size: 20px;
              font-weight: 700;
              line-height: 1;
              color: var(--el-text-color-primary);

              &.enabled {
                color: var(--el-color-success);
              }
            }
          }
        }
      }
    }

    .main-wapper {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .top-bar {
      margin: 10px 12px 8px;
      border-radius: 10px;
      background: var(--el-fill-color-light);
      border: 1px solid var(--el-border-color-lighter);
      flex-shrink: 0;

      .action-btn {
        border-radius: 8px;
      }
    }
  }
</style>
