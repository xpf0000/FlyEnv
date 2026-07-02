<template>
  <div class="module-config">
    <el-card class="app-base-el-card">
      <template #header>
        <el-radio-group v-model="logType">
          <el-radio-button value="out" :label="I18nT('base.log')"></el-radio-button>
          <el-radio-button value="error" :label="I18nT('common.label.errorLog')"></el-radio-button>
        </el-radio-group>
      </template>
      <template #default>
        <LogVM ref="log" :log-file="filepath" class="h-full overflow-hidden" />
      </template>
      <template #footer>
        <ToolVM :log="log" />
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { join } from '@/util/path-browserify'
  import { BrewStore } from '@/store/brew'
  import { I18nT } from '@lang/index'

  const log = ref()
  const brewStore = BrewStore()
  const logType = ref<'out' | 'error'>('out')

  const currentVersion = computed(() => {
    return brewStore.currentVersion('cliproxyapi')
  })

  const filepath = computed(() => {
    if (!currentVersion?.value?.version) {
      return ''
    }
    const versionStr = currentVersion.value.version.trim().split(' ').join('')
    return join(
      window.Server.BaseDir!,
      `cliproxyapi/cliproxyapi-${versionStr}-start-${logType.value}.log`
    )
  })
</script>
