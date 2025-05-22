<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ I18nT('ollama.model') }} </span>
          <el-button class="button" link @click="openURL('https://ollama.com/search')">
            <yb-icon
              style="width: 20px; height: 20px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
          <el-radio-group v-model="OllamaModelsSetup.tab" size="small" class="ml-6">
            <el-radio-button
              class="flex-1"
              :label="I18nT('versionmanager.Local')"
              value="local"
            ></el-radio-button>
            <el-radio-button
              class="flex-1"
              :label="I18nT('versionmanager.Library')"
              value="all"
            ></el-radio-button>
          </el-radio-group>
        </div>
        <el-button class="button" link :disabled="loading" @click="reFetch">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <template v-if="OllamaModelsSetup.tab === 'local'">
      <LocalVM />
    </template>
    <template v-else-if="OllamaModelsSetup.tab === 'all'">
      <AllVM />
    </template>

    <template v-if="showFooter" #footer>
      <template v-if="taskEnd">
        <el-button type="primary" @click.stop="taskConfirm">{{ I18nT('base.confirm') }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { OllamaModelsSetup, SetupAll } from './setup'
  import LocalVM from './local/index.vue'
  import AllVM from './all/index.vue'

  const { showFooter, taskEnd, taskConfirm, taskCancel, loading, reFetch, openURL } = SetupAll()
</script>
