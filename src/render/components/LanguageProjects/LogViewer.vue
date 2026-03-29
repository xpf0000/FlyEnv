<template>
  <el-drawer
    v-model="show"
    size="60%"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-edit">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">{{ I18nT('base.log') }}</span>
        </div>
        <div class="flex items-center gap-3">
          <el-button link @click="refreshLogs">
            <Refresh class="w-[20px] h-[20px]" :class="{ 'fa-spin': refreshing }" />
          </el-button>
          <el-button link @click="clearLogs">
            <Delete class="w-[18px] h-[18px]" />
          </el-button>
        </div>
      </div>
      <div class="flex-1 overflow-hidden">
        <el-tabs v-model="activeTab" type="border-card" class="h-full flex flex-col">
          <template v-for="(log, index) in logs" :key="index">
            <el-tab-pane :label="log.name || log.path" :name="index" class="h-full">
              <div class="h-full flex flex-col">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm text-gray-500">{{ log.path }}</span>
                </div>
                <div class="flex-1 overflow-auto bg-gray-900 p-3 font-mono text-sm">
                  <pre class="text-green-400 whitespace-pre-wrap">{{
                    logContents[index] || I18nT('base.noLogs')
                  }}</pre>
                </div>
              </div>
            </el-tab-pane>
          </template>
        </el-tabs>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref, onMounted, onUnmounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { fs } from '@/util/NodeFn'
  import { MessageError } from '@/util/Element'
  import { Refresh, Delete } from '@element-plus/icons-vue'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    logs: Array<{ name: string; path: string }>
  }>()

  const activeTab = ref(0)
  const logContents = ref<string[]>([])
  const autoRefresh = ref(true)
  const refreshing = ref(false)
  let refreshTimer: any = null

  const loadLog = async (index: number) => {
    try {
      const log = props.logs[index]
      if (log && log.path) {
        const exists = await fs.existsSync(log.path)
        if (exists) {
          const content = await fs.readFile(log.path)
          logContents.value[index] = content.slice(-50000) // Last 50KB
        } else {
          logContents.value[index] = ''
        }
      }
    } catch (e: any) {
      logContents.value[index] = e.message
    }
  }

  const refreshLogs = async () => {
    refreshing.value = true
    for (let i = 0; i < props.logs.length; i++) {
      await loadLog(i)
    }
    setTimeout(() => {
      refreshing.value = false
    }, 500)
  }

  const clearLogs = async () => {
    try {
      const log = props.logs[activeTab.value]
      if (log && log.path) {
        await fs.writeFile(log.path, '')
        logContents.value[activeTab.value] = ''
      }
    } catch (e: any) {
      MessageError(e.message)
    }
  }

  onMounted(() => {
    props.logs.forEach((_, index) => {
      loadLog(index)
    })
    refreshTimer = setInterval(() => {
      if (autoRefresh.value) {
        loadLog(activeTab.value)
      }
    }, 3000)
  })

  onUnmounted(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer)
    }
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
