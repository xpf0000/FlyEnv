<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <el-radio-group v-model="currentTool" size="small">
            <el-radio-button value="default">FlyEnv</el-radio-button>
            <el-radio-button value="fnm">fnm</el-radio-button>
            <el-radio-button value="nvm">nvm</el-radio-button>
          </el-radio-group>
        </div>
        <el-button class="button" link @click="reFetch">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <template v-if="currentTool === 'fnm'">
      <FnmVM />
    </template>
    <template v-else-if="currentTool === 'nvm'">
      <NVMVM />
    </template>
    <template v-else-if="currentTool === 'default'">
      <DefaultVM />
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { NodejsStore } from '@/components/Nodejs/node'
  import { Setup } from '@/components/Nodejs/setup'
  import FnmVM from './fnm/index.vue'
  import NVMVM from './nvm/index.vue'
  import DefaultVM from './default/index.vue'

  const nodejsStore = NodejsStore()

  const { currentTool, loading, reFetch } = Setup()

  nodejsStore.fetchAll()
</script>
