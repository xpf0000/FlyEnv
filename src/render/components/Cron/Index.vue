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
            <el-button type="primary" @click="toAdd">
              <Plus class="w-4 h-4" />
              {{ I18nT('cron.add') }}
            </el-button>
            <el-button @click="refreshList">
              <Refresh class="w-4 h-4" />
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
  import { Plus, Refresh } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import { AppStore } from '@/store/app'
  import { AppModuleSetup } from '@/core/Module'
  import ListTable from '@/components/Host/Cron/ListTable.vue'
  import DialogAdd from '@/components/Host/Cron/DialogAdd.vue'
  import type { CronJob } from '@shared/app'

  const route = useRoute()
  const router = useRouter()
  const appStore = AppStore()
  const { tab } = AppModuleSetup('cron')
  const tabs = [I18nT('cron.title')]

  const hostFilter = ref('all')
  const listTableRef = ref<InstanceType<typeof ListTable>>()
  const showDialog = ref(false)
  const editingItem = ref<CronJob | null>(null)
  const stats = ref({
    total: 0,
    enabled: 0,
    disabled: 0,
    recent: 0
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
