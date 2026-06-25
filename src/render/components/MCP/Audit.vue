<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span>{{ I18nT('mcp.auditLog') }}</span>
        <el-button size="small" @click="refresh">{{ I18nT('base.refresh') }}</el-button>
      </div>
    </template>
    <div class="p-5">
      <p class="text-sm text-gray-500 mb-3">{{ I18nT('mcp.auditLogHint') }}</p>
      <div v-if="logs.length === 0" class="text-sm text-gray-400 py-10 text-center">
        {{ I18nT('mcp.auditLogEmpty') }}
      </div>
      <div v-else class="flex flex-col gap-3 max-h-[60vh] overflow-auto">
        <div
          v-for="(log, index) in logs"
          :key="index"
          class="border-b border-gray-100 dark:border-gray-700 pb-2 text-xs"
        >
          <div class="flex items-center gap-2 mb-1">
            <span class="text-gray-500">{{ log.time }}</span>
            <el-tag :type="log.success ? 'success' : 'danger'" size="small">
              {{ log.success ? 'OK' : 'FAIL' }}
            </el-tag>
            <span class="font-mono font-medium">{{ log.tool }}</span>
          </div>
          <pre class="bg-gray-100 dark:bg-gray-800 rounded p-2 overflow-auto">{{
            formatArgs(log.args)
          }}</pre>
          <p v-if="log.error" class="text-red-500 mt-1">{{ log.error }}</p>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'

  interface AuditEntry {
    time: string
    tool: string
    args: Record<string, any>
    success: boolean
    error?: string
  }

  const logs = ref<AuditEntry[]>([])

  const parseLog = (text: string): AuditEntry[] => {
    const lines = text.trim().split('\n').filter(Boolean)
    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as AuditEntry
        } catch {
          return null
        }
      })
      .filter(Boolean) as AuditEntry[]
  }

  const formatArgs = (args: Record<string, any>) => {
    return JSON.stringify(args, null, 2)
  }

  const refresh = () => {
    IPC.send('mcp:getAuditLog').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        logs.value = parseLog(res?.data || '')
      }
    })
  }

  onMounted(() => {
    refresh()
  })
</script>
