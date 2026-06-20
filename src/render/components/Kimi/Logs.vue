<template>
  <div class="module-config">
    <el-card class="app-base-el-card">
      <template #header>
        <div class="flex items-center">
          <el-radio-group v-model="filepath">
            <template v-for="(item, _index) in logFiles" :key="_index">
              <el-radio-button :value="item.path" :label="item.name"></el-radio-button>
            </template>
          </el-radio-group>
        </div>
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
  import { KimiSetup } from './setup'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'

  const log = ref()
  const logFiles = ref<Array<{ name: string; path: string }>>([])

  const filepath = computed({
    get() {
      return KimiSetup.logTab
    },
    set(value) {
      KimiSetup.logTab = value
    }
  })

  const init = async () => {
    const files = await KimiSetup.getLogFiles()
    logFiles.value = files
    if (files.length > 0 && !filepath.value) {
      filepath.value = files[0].path
    }
  }

  init().catch()
</script>
