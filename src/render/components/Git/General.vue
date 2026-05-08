<template>
  <div class="flex flex-col gap-3">
    <el-card header="Git Environment">
      <div class="flex items-center justify-between mb-3">
        <div class="text-sm text-gray-500">{{ info.platform }} · {{ info.arch }}</div>
        <el-button :loading="loading" @click="fetchInfo">Refresh</el-button>
      </div>
      <el-alert class="mb-3" :title="info.recommended" type="info" show-icon />
      <el-descriptions :column="1" border>
        <el-descriptions-item label="FlyEnv Data Dir">{{
          info.dataRoot || '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="FlyEnv Managed Git Dir">{{
          info.appDir || '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="Executable">{{
          info.executableName || '-'
        }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card header="Diagnostics">
      <el-table v-loading="loading" :data="info.items" show-overflow-tooltip>
        <el-table-column label="Item" prop="label" width="160" />
        <el-table-column label="Status" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.ok ? 'success' : 'danger'">
              {{ scope.row.ok ? 'OK' : 'Missing' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Command / Path" prop="value" />
        <el-table-column label="Result" prop="message" />
      </el-table>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, reactive, ref } from 'vue'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { I18nT } from '@lang/index'

  type GitCheckItem = {
    label: string
    ok: boolean
    value: string
    message: string
  }

  const loading = ref(false)
  const info = reactive({
    platform: '',
    arch: '',
    dataRoot: '',
    appDir: '',
    executableName: '',
    recommended: '',
    items: [] as GitCheckItem[]
  })

  const fetchInfo = () => {
    if (loading.value) {
      return
    }
    loading.value = true
    IPC.send('app-fork:git', 'check').then((key: string, res: any) => {
      IPC.off(key)
      loading.value = false
      if (res?.code === 0) {
        Object.assign(info, res.data)
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
    })
  }

  onMounted(fetchInfo)
</script>
