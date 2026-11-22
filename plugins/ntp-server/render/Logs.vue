<template>
  <div class="module-config">
    <el-card>
      <el-radio-group v-model="logName" class="mb-3">
        <el-radio-button :value="serviceLogName">{{ t('serviceLog') }}</el-radio-button>
        <el-radio-button :value="errorLogName">{{ t('startupErrors') }}</el-radio-button>
      </el-radio-group>
      <LogVM :key="logRevision" ref="log" :log-file="filepath" />
      <template #footer>
        <ToolVM :log="log" />
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'
  import { errorLogName, ntpModuleId, serviceLogName } from '../config'
  import { t } from './lang'
  import { typeFlag } from './Module'

  const log = ref()
  const logName = ref(serviceLogName)
  const logRevision = ref(0)
  const filepath = computed(() => join(window.Server.BaseDir!, ntpModuleId, logName.value))
  const module = BrewStore().module(typeFlag)
  // A first startup can create the log after the shared viewer checked its existence.
  watch(
    () => module.installed.some((version) => version.running),
    (busy) => {
      if (!busy) logRevision.value++
    }
  )
</script>
