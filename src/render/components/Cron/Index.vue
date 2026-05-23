<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>

    <div class="main-block cron-main-block">
      <template v-if="tab === 0">
        <div class="cron-toolbar">
          <div class="left">
            <template v-if="isLock">
              <el-tooltip placement="right" :content="I18nT('cron.licenseTips')">
                <el-button :icon="Lock" type="warning" @click="toLicense">
                  {{ I18nT('cron.add') }}
                </el-button>
              </el-tooltip>
            </template>
            <template v-else>
              <el-button :icon="Plus" type="primary" @click="toAdd">
                {{ I18nT('cron.add') }}
              </el-button>
            </template>
            <el-button :icon="Refresh" @click="refreshList">
              {{ I18nT('base.refresh') }}
            </el-button>
          </div>

          <div class="stats">
            <el-tag effect="plain">{{ I18nT('cron.total') }}: {{ stats.total }}</el-tag>
            <el-tag type="success" effect="plain"
              >{{ I18nT('cron.enabled') }}: {{ stats.enabled }}</el-tag
            >
            <el-tag type="info" effect="plain"
              >{{ I18nT('cron.disabled') }}: {{ stats.disabled }}</el-tag
            >
            <el-tag effect="plain">{{ I18nT('cron.updated24h') }}: {{ stats.recent }}</el-tag>
          </div>

          <el-select v-model="hostFilter" class="host-filter" filterable>
            <el-option
              v-for="item in hostOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </div>

        <ListTable
          ref="listTableRef"
          :host-id="selectedHostId"
          :show-host-column="selectedHostId === undefined"
          @edit="onEdit"
          @stats-change="onStatsChange"
        />
      </template>
      <template v-else-if="tab === 1">
        <SystemTaskTable ref="systemTaskTableRef" />
      </template>
    </div>

    <DialogAdd
      v-if="showDialog"
      :host-id="dialogHostId"
      :item="editingItem"
      @refresh="refreshList"
      @close="showDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { Plus, Refresh, Lock } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import { AppStore } from '@/store/app'
  import { AppModuleSetup } from '@/core/Module'
  import { SetupStore } from '@/components/Setup/store'
  import Router from '@/router'
  import ListTable from './ListTable.vue'
  import SystemTaskTable from './SystemTaskTable.vue'
  import DialogAdd from './DialogAdd.vue'
  import type { CronJob } from '@shared/app'

  const route = useRoute()
  const router = useRouter()
  const appStore = AppStore()
  const setupStore = SetupStore()
  const { tab } = AppModuleSetup('cron')
  const tabs = [I18nT('cron.title'), I18nT('cron.systemTasks')]

  const hostFilter = ref('all')
  const listTableRef = ref<InstanceType<typeof ListTable>>()
  const systemTaskTableRef = ref<InstanceType<typeof SystemTaskTable>>()
  const showDialog = ref(false)
  const editingItem = ref<CronJob | null>(null)
  const stats = ref({
    total: 0,
    enabled: 0,
    disabled: 0,
    recent: 0
  })

  const isLock = computed(() => {
    return !setupStore.isActive && stats.value.total >= 1
  })

  const hostOptions = computed(() => {
    return [
      { label: I18nT('cron.allTasks'), value: 'all' },
      { label: I18nT('cron.global'), value: '0' },
      ...appStore.hosts.map((host) => ({
        label: host.name,
        value: `${host.id}`
      }))
    ]
  })

  const selectedHostId = computed(() => {
    if (hostFilter.value === 'all') {
      return undefined
    }
    return Number(hostFilter.value)
  })

  const dialogHostId = computed(() => {
    if (editingItem.value) {
      return editingItem.value.hostId ?? 0
    }
    return selectedHostId.value
  })

  const syncHostFilterFromRoute = () => {
    const hostId = route.query.hostId
    if (typeof hostId === 'string' && /^\d+$/.test(hostId)) {
      hostFilter.value = hostId
      return
    }
    hostFilter.value = 'all'
  }

  watch(() => route.query.hostId, syncHostFilterFromRoute, { immediate: true })

  watch(hostFilter, (value) => {
    const query = { ...route.query }
    if (value === 'all') {
      delete query.hostId
    } else {
      query.hostId = value
    }
    router.replace({ path: '/cron', query }).catch(() => {})
  })

  const toAdd = () => {
    editingItem.value = null
    showDialog.value = true
  }

  const toLicense = () => {
    setupStore.tab = 'licenses'
    appStore.currentPage = '/setup'
    Router.push({
      path: '/setup'
    })
      .then()
      .catch()
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
    if (tab.value === 1) {
      systemTaskTableRef.value?.loadData()
      return
    }
    listTableRef.value?.loadData()
  }
</script>

<style scoped lang="scss">
  .cron-main-block {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .cron-toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;

      .left,
      .stats {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .stats {
        margin-left: auto;
      }

      .host-filter {
        width: 240px;
        flex-shrink: 0;
      }
    }
  }

  @media (max-width: 980px) {
    .cron-main-block {
      .cron-toolbar {
        flex-wrap: wrap;

        .stats {
          width: 100%;
          margin-left: 0;
        }

        .host-filter {
          width: 100%;
        }
      }
    }
  }
</style>
