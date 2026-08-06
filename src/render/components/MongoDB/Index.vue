<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="mongodb" title="MongoDB">
        <template v-if="isRunning" #tool-left>
          <el-button
            style="color: #01cc74"
            class="button"
            link
            :disabled="dbGateOpening || !dbGateNodeAvailable"
            @click.stop="dbGatePanel.open()"
          >
            <el-icon
              v-if="dbGateOpening"
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
        type-flag="mongodb"
        url="https://www.mongodb.com/try/download/community"
        title="Mongodb"
      ></Manager>
      <Config v-if="tab === 2"></Config>
      <Logs v-if="tab === 3"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import { computed } from 'vue'
  import { Loading } from '@element-plus/icons-vue'
  import { BrewStore } from '@/store/brew'
  import dbGatePanel from './DbGatePanel'

  const { tab, checkVersion } = AppModuleSetup('mongodb')
  const brewStore = BrewStore()
  const isRunning = computed(() => {
    return brewStore.module('mongodb').installed.some((item) => item.run)
  })
  const dbGateOpening = dbGatePanel.opening
  const dbGateNodeAvailable = dbGatePanel.nodeAvailable
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]

  checkVersion()
</script>
