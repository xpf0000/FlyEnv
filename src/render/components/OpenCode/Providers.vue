<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span>{{ I18nT('openCode.providers') }}</span>
        <el-button
          link
          :disabled="OpenCodeSetup.providersLoading"
          @click="OpenCodeSetup.refreshProviders()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': OpenCodeSetup.providersLoading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <div
        v-loading="OpenCodeSetup.providersLoading"
        class="p-5 h-full overflow-hidden flex flex-col"
      >
        <el-scrollbar v-if="OpenCodeSetup.providers.length > 0">
          <el-table :data="OpenCodeSetup.providers" style="width: 100%">
            <el-table-column prop="id" :label="I18nT('openCode.providerId')" />
            <el-table-column prop="type" :label="I18nT('common.mcp.type')" width="160" />
          </el-table>
        </el-scrollbar>
        <el-empty
          v-else-if="!OpenCodeSetup.providersLoading"
          :description="I18nT('openCode.noProviders')"
        />
      </div>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { OpenCodeSetup } from './setup'

  onMounted(() => {
    OpenCodeSetup.refreshProviders()
  })
</script>
