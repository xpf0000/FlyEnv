<template>
  <div class="soft-index-panel main-right-panel aicli-panel">
    <div class="aicli-header">
      <span class="label">{{ I18nT('aicli.tool') }}:</span>
      <el-select v-model="store.currentFlag" style="width: 200px" @change="onToolChange">
        <el-option v-for="t in store.tools" :key="t.flag" :label="t.name" :value="t.flag" />
      </el-select>
      <template v-if="!store.loading">
        <el-tag v-if="store.installed[store.currentFlag]" type="success" class="ml-3">
          {{ I18nT('base.version') }} {{ store.version[store.currentFlag] || '-' }}
        </el-tag>
        <el-tag v-else type="info" class="ml-3">{{ I18nT('aicli.notInstalled') }}</el-tag>
      </template>
      <el-button link class="ml-2" @click="store.openDoc()">
        <yb-icon style="width: 18px; height: 18px" :svg="import('@/svg/http.svg?raw')" />
      </el-button>
      <div class="flex-1"></div>
      <el-button link :disabled="store.loading" @click="store.init()">
        <yb-icon
          :svg="import('@/svg/icon_refresh.svg?raw')"
          class="refresh-icon"
          :class="{ 'fa-spin': store.loading }"
        />
      </el-button>
    </div>

    <div class="main-block">
      <InstallPanel v-if="!store.installed[store.currentFlag]" />
      <RunPanel v-else />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { AICliSetup } from './shared/setup'
  import InstallPanel from './shared/InstallPanel.vue'
  import RunPanel from './shared/RunPanel.vue'

  const store = AICliSetup

  const onToolChange = () => {
    store.init()
  }

  onMounted(() => {
    store.loadProviders().then(() => {
      store.init()
    })
  })
</script>

<style lang="scss" scoped>
  .aicli-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .aicli-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 16px 20px 8px;
    flex-shrink: 0;
  }
  .main-block {
    flex: 1;
    overflow: hidden;
    padding: 0 20px 16px;
  }
</style>
