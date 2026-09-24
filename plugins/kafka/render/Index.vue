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
        type-flag="kafka"
        title="Kafka"
        column-label="Java"
        :column-width="160"
      >
        <template #column="{ row }">
          <div class="flex items-center justify-center gap-2 w-full">
            <template v-if="javaCandidates(row).length">
              <el-select
                :model-value="selectedJava(row)"
                :disabled="row.run || row.running"
                size="small"
                class="w-[140px]"
                :placeholder="KafkaT('selectJava')"
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
                {{ KafkaT('installCompatibleJava') }}
              </el-button>
            </template>
          </div>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="kafka"
        title="Kafka"
        :has-static="true"
        :show-brew-lib="false"
        :show-port-lib="false"
        url="https://kafka.apache.org/downloads"
      />
      <Topics v-else-if="tab === 2" />
      <Config v-else-if="tab === 3" />
      <Logs v-else-if="tab === 4" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { AppModuleSetup } from '@/core/Module'
  import Router from '@/router/index'
  import { BrewStore } from '@/store/brew'
  import type { SoftInstalled } from '@/store/brew'
  import Service from '@/components/ServiceManager/index.vue'
  import Manager from '@/components/VersionManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Topics from './Topics.vue'
  import { KafkaManager } from './store'
  import { KafkaT } from './lang'
  import { kafkaJavaCandidateMajor, type KafkaJavaCandidate } from './policy'

  const { tab, checkVersion } = AppModuleSetup('kafka')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    KafkaT('topics'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]

  const kafkaManager = KafkaManager
  // Load persisted bindings before reconciliation; row helpers remain pure reads.
  KafkaManager.init().catch()

  // No current version lands the user on the version-manager tab, whose
  // installed flags are synced from this list; never wait for a manual refresh.
  const kafkaModule = BrewStore().module('kafka')
  if (!kafkaModule.installedFetched) {
    kafkaModule.fetchInstalled(true).catch()
  }

  const javaCandidates = (_row: SoftInstalled) => kafkaManager.candidates()
  const javaLabel = (candidate: KafkaJavaCandidate) => {
    const major = kafkaJavaCandidateMajor(candidate)
    return `Java ${major}${candidate.path ? ` · ${candidate.path}` : ''}`
  }
  const selectedJava = (row: SoftInstalled) => kafkaManager.getBinding(row.bin)?.javaHome ?? ''
  const updateJava = async (row: SoftInstalled, javaHome: string) => {
    if (row.run || row.running) return
    const candidate = javaCandidates(row).find((item) => item.path === javaHome)
    if (!candidate) return
    await kafkaManager.setBinding(row.bin, {
      javaHome: candidate.path,
      javaMajor: kafkaJavaCandidateMajor(candidate)
    })
  }
  const openJavaModule = () => {
    Router.push({ path: '/java' }).catch()
  }

  checkVersion()
</script>
