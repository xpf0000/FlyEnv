<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li
        v-for="(item, index) in tabs"
        :key="index"
        :class="tab === index ? 'active' : ''"
        @click="tab = index"
        >{{ item }}</li
      >
    </ul>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="rabbitmq" title="RabbitMQ">
        <template v-if="isRun" #tool-left>
          <el-button style="color: #01cc74" class="button" link @click="openURL">
            <yb-icon
              style="width: 20px; height: 20px; margin-left: 10px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
        </template>
      </Service>
      <Manager v-else-if="tab === 1" type-flag="rabbitmq"></Manager>
      <Config v-if="tab === 2"></Config>
      <Logs v-if="tab === 3"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@web/core/Module'
  import { I18nT } from '@shared/lang'
  import { AppStore } from '@web/store/app'
  import { BrewStore } from '@web/store/brew'

  const appStore = AppStore()
  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    const current = appStore.config.server?.rabbitmq?.current
    const installed = brewStore.module('rabbitmq').installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const isRun = computed(() => {
    return currentVersion?.value?.run
  })

  const openURL = () => {}

  const { tab, checkVersion } = AppModuleSetup('rabbitmq')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  checkVersion()
</script>
