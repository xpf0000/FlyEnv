<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left flex items-center">
          <span>{{ I18nT('openCode.stats') }}</span>
          <el-select
            v-model="days"
            size="small"
            class="ml-4"
            style="width: 130px"
            @change="refresh"
          >
            <el-option :label="I18nT('openCode.allTime')" :value="0" />
            <el-option :label="I18nT('openCode.last7Days')" :value="7" />
            <el-option :label="I18nT('openCode.last30Days')" :value="30" />
          </el-select>
        </div>
        <el-button link :disabled="OpenCodeSetup.statsLoading" @click="refresh">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': OpenCodeSetup.statsLoading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <div v-loading="OpenCodeSetup.statsLoading" class="p-5 h-full overflow-hidden">
        <el-scrollbar v-if="OpenCodeSetup.stats.length > 0">
          <div v-for="(group, gIndex) in OpenCodeSetup.stats" :key="gIndex" class="stat-group mb-5">
            <div class="stat-title">{{ group.title }}</div>
            <el-descriptions :column="3" direction="vertical" border size="small">
              <el-descriptions-item
                v-for="(row, rIndex) in group.rows"
                :key="rIndex"
                :label="row.label"
              >
                {{ row.value }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </el-scrollbar>
        <el-empty v-else-if="!OpenCodeSetup.statsLoading" />
      </div>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { OpenCodeSetup } from './setup'

  const days = ref(OpenCodeSetup.statsDays)

  const refresh = () => {
    OpenCodeSetup.statsDays = days.value
    OpenCodeSetup.refreshStats()
  }

  onMounted(() => {
    refresh()
  })
</script>
<style lang="scss" scoped>
  .stat-group {
    .stat-title {
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 8px;
      color: var(--el-text-color-primary);
    }
  }
</style>
