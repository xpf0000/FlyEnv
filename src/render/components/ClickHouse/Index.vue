<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="clickhouse" title="ClickHouse">
        <template v-if="isRunning" #tool-left>
          <el-button
            style="color: #01cc74"
            class="button"
            link
            :disabled="chUIOpening"
            @click.stop="chUiPanel.open()"
          >
            <el-icon
              v-if="chUIOpening"
              class="is-loading"
              style="width: 20px; height: 20px; margin-left: 10px"
            >
              <Loading />
            </el-icon>
            <yb-icon
              v-else
              style="width: 20px; height: 20px; margin-left: 10px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="clickhouse"
        url="https://github.com/ClickHouse/ClickHouse/releases"
        title="ClickHouse"
        :has-static="true"
        :show-brew-lib="false"
        :show-port-lib="false"
      ></Manager>
      <Config v-else-if="tab === 2"></Config>
      <Logs v-else-if="tab === 3"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { computed } from 'vue'
  import { Loading } from '@element-plus/icons-vue'
  import { BrewStore } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import chUiPanel from './ChUiPanel'

  const brewStore = BrewStore()
  const isRunning = computed(() => {
    return brewStore.module('clickhouse').installed.some((item) => item.run)
  })
  const chUIOpening = chUiPanel.opening
  const { tab, checkVersion } = AppModuleSetup('clickhouse')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]

  checkVersion()
</script>
