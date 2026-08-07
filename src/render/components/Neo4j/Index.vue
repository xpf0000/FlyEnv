<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index" />
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service
        v-if="tab === 0"
        type-flag="neo4j"
        title="Neo4j"
        column-label="Java"
        :column-width="220"
      >
        <template #tool-left>
          <el-button
            v-if="runningVersion"
            style="color: #01cc74"
            class="button"
            link
            :disabled="browserOpening"
            @click.stop="neo4jController.openBrowser(runningVersion)"
          >
            <el-icon v-if="browserOpening" class="is-loading"><Loading /></el-icon>
            <yb-icon v-else :svg="import('@/svg/http.svg?raw')" class="w-5 h-5" />
          </el-button>
        </template>
        <template #column="{ row }">
          <div class="flex items-center justify-center gap-2 w-full">
            <template v-if="!neo4jManager.policyForVersion(row.version).supportedMajor.length">
              <span class="text-red-400 text-xs">Unsupported Neo4j version</span>
            </template>
            <template v-else-if="javaCandidates(row).length">
              <el-select
                :model-value="selectedJava(row)"
                :disabled="row.run || row.running"
                size="small"
                class="neo4j-java-select"
                placeholder="Select Java"
                @change="(value: string) => updateJava(row, value)"
              >
                <el-option
                  v-for="candidate in javaCandidates(row)"
                  :key="candidate.path"
                  :label="javaLabel(candidate)"
                  :value="candidate.path"
                />
              </el-select>
            </template>
            <template v-else>
              <el-button link type="warning" @click.stop="openJavaModule">
                Install compatible Java
              </el-button>
            </template>
          </div>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="neo4j"
        title="Neo4j"
        :has-static="true"
        :show-brew-lib="false"
        :show-port-lib="false"
        url="https://neo4j.com/deployment-center/"
      />
      <Config v-else-if="tab === 2" />
      <Logs v-else-if="tab === 3" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, watch } from 'vue'
  import { Loading } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import { AppModuleSetup } from '@/core/Module'
  import Router from '@/router/index'
  import { BrewStore, type SoftInstalled } from '@/store/brew'
  import Service from '../ServiceManager/index.vue'
  import Manager from '../VersionManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import neo4jController from './controller'
  import { Neo4jManager } from './store'

  const { tab, checkVersion } = AppModuleSetup('neo4j')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]

  const brewStore = BrewStore()
  const neo4jManager = Neo4jManager
  // Load persisted bindings before reconciliation; row helpers remain pure reads.
  Neo4jManager.init().catch()
  const installed = computed(() => brewStore.module('neo4j').installed)
  const javaInstalled = computed(() => brewStore.module('java').installed)
  const runningVersion = computed(() => installed.value.find((item) => item.run))
  const browserOpening = neo4jController.opening

  const javaCandidates = (row: SoftInstalled) => neo4jManager.candidatesForVersion(row.version)
  const javaMajor = (candidate: any) => neo4jManager.candidateMajor(candidate)
  const javaLabel = (candidate: any) => {
    const major = javaMajor(candidate)
    return `Java ${major}${candidate.path ? ` · ${candidate.path}` : ''}`
  }
  const selectedJava = (row: SoftInstalled) => neo4jManager.getBinding(row.bin)?.javaHome ?? ''
  const updateJava = async (row: SoftInstalled, javaHome: string) => {
    if (row.run || row.running) return
    const candidate = javaCandidates(row).find((item) => item.path === javaHome)
    if (!candidate) return
    await neo4jManager.setBinding(row.bin, {
      javaHome: candidate.path,
      javaMajor: javaMajor(candidate)
    })
  }
  const openJavaModule = () => {
    Router.push({ path: '/java' }).catch()
  }

  watch(
    [installed, javaInstalled],
    ([versions]) => {
      const neo4jModule = brewStore.module('neo4j' as any)
      if (versions.length === 0 && !neo4jModule.installedFetched) return
      neo4jManager.reconcileBindings(versions).catch()
    },
    { immediate: true }
  )

  checkVersion()
</script>

<style lang="scss" scoped>
  .neo4j-java-select {
    width: 200px;
  }
</style>
