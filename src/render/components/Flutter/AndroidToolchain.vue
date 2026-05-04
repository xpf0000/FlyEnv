<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>Android Toolchain</span>
          <span class="ml-3 text-sm opacity-70">{{ summaryText }}</span>
        </div>
        <el-button link :disabled="loading" @click="fetchReadiness">{{ I18nT('base.refresh') }}</el-button>
      </div>
    </template>

    <el-descriptions :column="1" border class="mb-4" size="small">
      <el-descriptions-item label="ANDROID_HOME">{{ env.ANDROID_HOME || '-' }}</el-descriptions-item>
      <el-descriptions-item label="ANDROID_SDK_ROOT">{{ env.ANDROID_SDK_ROOT || '-' }}</el-descriptions-item>
      <el-descriptions-item label="JAVA_HOME">{{ env.JAVA_HOME || '-' }}</el-descriptions-item>
    </el-descriptions>

    <div class="mb-4 flex flex-wrap gap-2">
      <el-button size="small" :loading="fixing" @click="runAutoFix('set-sdk-env')"
        >Fix SDK Env</el-button
      >
      <el-button size="small" :loading="fixing" @click="runAutoFix('add-platform-tools-path')"
        >Fix PATH (platform-tools)</el-button
      >
      <el-button size="small" type="primary" :loading="fixing" @click="runAutoFix('all')"
        >Run All Auto-fix</el-button
      >
      <el-button size="small" :disabled="!sdkDir" @click="openSdkDir">Open Android SDK</el-button>
    </div>

    <template v-if="loading">
      <div class="pc-report-loading mb-4">
        <div class="pc-report-loading-title">Fetching Android toolchain details...</div>
        <div class="pc-report-skeleton-grid">
          <el-skeleton v-for="i in 8" :key="`toolchain-loading-${i}`" animated>
            <template #template>
              <el-skeleton-item variant="text" style="width: 100%; height: 14px" />
            </template>
          </el-skeleton>
        </div>
      </div>
    </template>
    <template v-else>
      <el-table :data="checks" show-overflow-tooltip>
        <el-table-column label="Status" width="120" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.ok ? 'success' : 'danger'">
              {{ scope.row.ok ? 'OK' : 'Missing' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="label" label="Component" width="200"></el-table-column>
        <el-table-column prop="value" label="Detected Value"></el-table-column>
        <el-table-column prop="hint" label="Hint" width="320"></el-table-column>
      </el-table>
    </template>

    <el-card class="mt-4" shadow="never">
      <template #header>
        <div class="card-header">
          <div class="left">
            <span>ADB Devices</span>
            <span class="ml-3 text-sm opacity-70">{{ devicesSummaryText }}</span>
          </div>
          <el-button link :disabled="devicesLoading" @click="fetchDevices">{{
            I18nT('base.refresh')
          }}</el-button>
        </div>
      </template>

      <div class="text-xs opacity-70 mb-3">ADB: {{ adbPath || '-' }}</div>

      <template v-if="devicesLoading">
        <div class="pc-report-loading">
          <div class="pc-report-loading-title">Fetching ADB devices...</div>
          <div class="model-fit-skeleton-grid">
            <el-skeleton v-for="i in 6" :key="`devices-loading-${i}`" animated>
              <template #template>
                <el-skeleton-item variant="text" style="width: 100%; height: 14px" />
              </template>
            </el-skeleton>
          </div>
        </div>
      </template>
      <el-table v-else :data="devices" show-overflow-tooltip>
        <el-table-column label="Device ID" min-width="220">
          <template #default="scope">
            <div class="flex items-center gap-2">
              <span>{{ scope.row.id }}</span>
              <el-tag v-if="targetDevice && targetDevice === scope.row.id" type="success" size="small"
                >Target</el-tag
              >
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Status" width="140" align="center">
          <template #default="scope">
            <el-tag :type="deviceStatusTag(scope.row.status)">
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="meta" label="Details"></el-table-column>
        <el-table-column label="Actions" width="290" align="center">
          <template #default="scope">
            <div class="flex items-center justify-center gap-2">
              <el-button
                size="small"
                link
                :disabled="scope.row.id === targetDevice"
                @click="runDeviceAction('set-target', scope.row)"
                >Set as Target</el-button
              >
              <el-button size="small" link type="warning" @click="runDeviceAction('disconnect', scope.row)"
                >Disconnect</el-button
              >
              <el-button size="small" link @click="runDeviceAction('info', scope.row)"
                >Open Device Info</el-button
              >
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="mt-4" shadow="never">
      <template #header>
        <div class="card-header">
          <div class="left">
            <span>Flutter Doctor</span>
            <span class="ml-3 text-sm opacity-70">{{ doctorSummaryText }}</span>
          </div>
          <el-button link :loading="doctorLoading" @click="fetchDoctor">{{ I18nT('base.refresh') }}</el-button>
          <el-button class="button" :disabled="!doctorRaw" link @click="copyDoctorReport"
            >Copy Report</el-button
          >
        </div>
      </template>

      <div class="text-xs opacity-70 mb-3">Flutter: {{ flutterBin || '-' }}</div>

      <el-alert
        v-if="!doctorLoading && doctorMessage && !doctorItems.length"
        :title="doctorMessage"
        type="warning"
        :closable="false"
        class="mb-3"
      />

      <template v-if="doctorLoading">
        <div class="pc-report-loading">
          <div class="pc-report-loading-title">Running flutter doctor...</div>
          <div class="model-fit-skeleton-grid">
            <el-skeleton v-for="i in 6" :key="`doctor-loading-${i}`" animated>
              <template #template>
                <el-skeleton-item variant="text" style="width: 100%; height: 14px" />
              </template>
            </el-skeleton>
          </div>
        </div>
      </template>
      <el-table v-else :data="doctorDisplayItems" show-overflow-tooltip>
        <template #empty>
          <span class="text-xs opacity-70">No parsed doctor checks. Use Copy Report for full output.</span>
        </template>
        <el-table-column label="Status" width="140" align="center">
          <template #default="scope">
            <el-tag :type="doctorStatusTag(scope.row.status)">
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="Component" min-width="260"></el-table-column>
        <el-table-column label="Details">
          <template #default="scope">
            <div class="text-xs whitespace-pre-wrap">{{ scope.row.details.join('\n') || '-' }}</div>
          </template>
        </el-table-column>
      </el-table>

      <el-input
        v-if="doctorRaw"
        v-model="doctorRaw"
        type="textarea"
        :rows="8"
        readonly
        class="mt-3"
        placeholder="Flutter doctor raw output"
      ></el-input>
    </el-card>

    <el-card class="mt-4" shadow="never">
      <template #header>
        <div class="card-header">
          <div class="left">
            <span>Flutter Quick Actions</span>
          </div>
        </div>
      </template>

      <div class="mb-3 flex items-center gap-2">
        <el-input v-model="projectDir" placeholder="Select Flutter project directory"></el-input>
        <el-button @click="chooseProjectDir">Browse</el-button>
        <el-button :disabled="!projectDir" @click="openProjectDir">Open</el-button>
      </div>

      <div class="mb-3 flex flex-wrap gap-2">
        <el-button size="small" type="primary" :loading="quickRunning" @click="runQuickAction('run')"
          >flutter run</el-button
        >
        <el-button size="small" :loading="quickRunning" @click="runQuickAction('build-apk')"
          >flutter build apk</el-button
        >
        <el-button size="small" :loading="quickRunning" @click="runQuickAction('build-appbundle')"
          >flutter build appbundle</el-button
        >
      </div>

      <el-input
        v-model="quickLog"
        type="textarea"
        :rows="12"
        readonly
        placeholder="Command output will appear here"
      ></el-input>
    </el-card>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, reactive, ref } from 'vue'
  import IPC from '@/util/IPC'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { clipboard, dialog, shell } from '@/util/NodeFn'
  import { I18nT } from '@lang/index'
  import { ElMessageBox } from 'element-plus'
  import { AppStore } from '@/store/app'

  type CheckItem = {
    key: string
    label: string
    ok: boolean
    value: string
    hint: string
  }

  const loading = ref(false)
  const devicesLoading = ref(false)
  const doctorLoading = ref(false)
  const fixing = ref(false)

  const adbPath = ref('')
  const flutterBin = ref('')
  const doctorMessage = ref('')
  const sdkDir = ref('')
  const targetDevice = ref('')
  const projectDir = ref('')
  const quickRunning = ref(false)
  const quickLog = ref('')

  type DeviceItem = {
    id: string
    status: string
    meta: string
  }

  const devicesSummary = reactive({
    total: 0,
    online: 0,
    offline: 0,
    unauthorized: 0,
    other: 0
  })

  const devices = ref<DeviceItem[]>([])

  type DoctorStatus = 'ok' | 'warning' | 'error' | 'unknown'

  type DoctorItem = {
    status: DoctorStatus
    title: string
    details: string[]
  }

  const doctorItems = ref<DoctorItem[]>([])
  const doctorRaw = ref('')

  const doctorSummary = reactive({
    total: 0,
    ok: 0,
    warning: 0,
    error: 0,
    unknown: 0
  })

  const env = reactive({
    ANDROID_HOME: '',
    ANDROID_SDK_ROOT: '',
    JAVA_HOME: ''
  })

  const summary = reactive({
    passed: 0,
    total: 0,
    failed: 0
  })

  const checks = ref<CheckItem[]>([])
  const appStore = AppStore()

  const summaryText = computed(() => {
    if (!summary.total) {
      return 'No data yet'
    }
    return `${summary.passed}/${summary.total} ready`
  })

  const devicesSummaryText = computed(() => {
    if (!devicesSummary.total) {
      return 'No devices'
    }
    return `${devicesSummary.online}/${devicesSummary.total} online`
  })

  const doctorSummaryText = computed(() => {
    if (!doctorSummary.total) {
      return 'No checks'
    }
    return `${doctorSummary.ok}/${doctorSummary.total} ok, ${doctorSummary.warning} warning, ${doctorSummary.error} error`
  })

  const doctorDisplayItems = computed(() => {
    if (doctorItems.value.length) {
      return doctorItems.value
    }
    const lines = `${doctorRaw.value ?? ''}`
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => !!l)
      .slice(0, 80)

    return lines.map((line) => ({
      status: 'unknown' as DoctorStatus,
      title: line,
      details: []
    }))
  })

  const deviceStatusTag = (status: string) => {
    if (status === 'device') {
      return 'success'
    }
    if (status === 'offline' || status === 'unauthorized') {
      return 'danger'
    }
    return 'warning'
  }

  const doctorStatusTag = (status: DoctorStatus) => {
    if (status === 'ok') {
      return 'success'
    }
    if (status === 'error') {
      return 'danger'
    }
    if (status === 'warning') {
      return 'warning'
    }
    return 'info'
  }

  const fetchReadiness = () => {
    if (loading.value) {
      return
    }
    loading.value = true
    IPC.send('app-fork:flutter', 'androidReadiness').then((key: string, res: any) => {
      IPC.off(key)
      loading.value = false
      if (res?.code !== 0) {
        MessageError(res?.msg ?? 'Failed to read Android toolchain status')
        return
      }
      const data = res?.data ?? {}
      env.ANDROID_HOME = data?.env?.ANDROID_HOME ?? ''
      env.ANDROID_SDK_ROOT = data?.env?.ANDROID_SDK_ROOT ?? ''
      env.JAVA_HOME = data?.env?.JAVA_HOME ?? ''

      summary.passed = Number(data?.summary?.passed ?? 0)
      summary.total = Number(data?.summary?.total ?? 0)
      summary.failed = Number(data?.summary?.failed ?? 0)

      checks.value = Array.isArray(data?.checks) ? data.checks : []
      const sdkItem = checks.value.find((c) => c.key === 'sdk')
      sdkDir.value = sdkItem?.ok ? sdkItem.value : ''
    })
  }

  const fetchDevices = () => {
    if (devicesLoading.value) {
      return
    }
    devicesLoading.value = true
    IPC.send('app-fork:flutter', 'androidDevices').then((key: string, res: any) => {
      IPC.off(key)
      devicesLoading.value = false
      if (res?.code !== 0) {
        MessageError(res?.msg ?? 'Failed to read Android devices')
        return
      }
      const data = res?.data ?? {}
      adbPath.value = data?.adbPath ?? ''
      targetDevice.value = data?.targetDevice ?? ''
      devices.value = Array.isArray(data?.devices) ? data.devices : []

      devicesSummary.total = Number(data?.summary?.total ?? 0)
      devicesSummary.online = Number(data?.summary?.online ?? 0)
      devicesSummary.offline = Number(data?.summary?.offline ?? 0)
      devicesSummary.unauthorized = Number(data?.summary?.unauthorized ?? 0)
      devicesSummary.other = Number(data?.summary?.other ?? 0)
    })
  }

  const runDeviceAction = (action: 'set-target' | 'disconnect' | 'info', row: DeviceItem) => {
    const id = row?.id ?? ''
    if (!id) {
      return
    }

    IPC.send('app-fork:flutter', 'androidDeviceAction', action, id).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code !== 0) {
        MessageError(res?.msg ?? 'Device action failed')
        return
      }

      const data = res?.data ?? {}
      const ok = !!data?.ok
      const msg = `${data?.message ?? ''}`.trim()
      if (!ok) {
        MessageError(msg || 'Device action failed')
        return
      }

      if (data?.targetDevice) {
        targetDevice.value = data.targetDevice
      }

      if (action === 'info') {
        const state = `${data?.state ?? '-'}`
        const details = `${data?.details ?? '-'}`
        const content = `State: ${state}\n\n${details}`
        ElMessageBox.alert(content, `Device Info - ${id}`, {
          confirmButtonText: 'OK'
        })
      } else {
        MessageSuccess(msg || 'Device action completed')
        fetchDevices()
      }
    })
  }

  const fetchDoctor = () => {
    if (doctorLoading.value) {
      return
    }
    doctorLoading.value = true
    const timeout = setTimeout(() => {
      if (doctorLoading.value) {
        doctorLoading.value = false
        MessageError('Flutter doctor request timed out')
      }
    }, 45000)

    IPC.send(
      'app-fork:flutter',
      'flutterDoctor',
      JSON.parse(JSON.stringify(appStore.config.setup))
    ).then((key: string, res: any) => {
      IPC.off(key)
      clearTimeout(timeout)
      doctorLoading.value = false
      if (res?.code !== 0) {
        MessageError(res?.msg ?? 'Failed to run flutter doctor')
        return
      }
      const data = res?.data ?? {}
      flutterBin.value = data?.flutterBin ?? ''
      doctorMessage.value = data?.message ?? ''
      doctorItems.value = Array.isArray(data?.items) ? data.items : []
      doctorRaw.value = data?.raw ?? ''
      doctorSummary.total = Number(data?.summary?.total ?? 0)
      doctorSummary.ok = Number(data?.summary?.ok ?? 0)
      doctorSummary.warning = Number(data?.summary?.warning ?? 0)
      doctorSummary.error = Number(data?.summary?.error ?? 0)
      doctorSummary.unknown = Number(data?.summary?.unknown ?? 0)
    })
  }

  const copyDoctorReport = () => {
    if (!doctorRaw.value) {
      return
    }
    clipboard.writeText(doctorRaw.value)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const openSdkDir = () => {
    if (!sdkDir.value) {
      return
    }
    shell.openPath(sdkDir.value).catch(() => {
      MessageError('Failed to open Android SDK path')
    })
  }

  const runAutoFix = (action: 'set-sdk-env' | 'add-platform-tools-path' | 'all') => {
    if (fixing.value) {
      return
    }

    fixing.value = true
    IPC.send('app-fork:flutter', 'androidAutoFix', action).then((key: string, res: any) => {
      IPC.off(key)
      fixing.value = false
      if (res?.code !== 0) {
        MessageError(res?.msg ?? 'Android auto-fix failed')
        return
      }

      const data = res?.data ?? {}
      const ok = !!data?.ok
      const baseMsg = data?.message ?? (ok ? 'Auto-fix completed' : 'Auto-fix completed with issues')
      if (ok) {
        MessageSuccess(baseMsg)
      } else {
        const detail = Array.isArray(data?.results)
          ? data.results
              .filter((r: any) => !r?.ok)
              .map((r: any) => r?.message)
              .filter((s: string) => !!s)
              .join('; ')
          : ''
        MessageError(detail ? `${baseMsg}: ${detail}` : baseMsg)
      }

      fetchReadiness()
      fetchDevices()
      fetchDoctor()
    })
  }

  const chooseProjectDir = async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
    })
    if (!canceled && filePaths?.length) {
      projectDir.value = filePaths[0]
    }
  }

  const openProjectDir = () => {
    if (!projectDir.value) {
      return
    }
    shell.openPath(projectDir.value).catch(() => {
      MessageError('Failed to open project directory')
    })
  }

  const runQuickAction = (action: 'run' | 'build-apk' | 'build-appbundle') => {
    if (!projectDir.value) {
      MessageError('Please select Flutter project directory first')
      return
    }
    if (quickRunning.value) {
      return
    }

    quickRunning.value = true
    quickLog.value = `Running ${action}...\n`
    IPC.send('app-fork:flutter', 'flutterQuickAction', action, projectDir.value).then(
      (key: string, res: any) => {
        IPC.off(key)
        quickRunning.value = false
        if (res?.code !== 0) {
          quickLog.value += `${res?.msg ?? 'Command failed'}\n`
          MessageError(res?.msg ?? 'Command failed')
          return
        }

        const data = res?.data ?? {}
        const output = `${data?.output ?? ''}`
        quickLog.value = output || `${data?.message ?? ''}`
        if (data?.ok) {
          MessageSuccess(data?.message ?? 'Command completed')
        } else {
          MessageError(data?.message ?? 'Command failed')
        }
      }
    )
  }

  fetchReadiness()
  fetchDevices()
  fetchDoctor()
</script>

<style scoped>
  .pc-report-loading {
    border: 1px dashed rgba(148, 163, 184, 0.35);
    border-radius: 8px;
    padding: 12px;
    background: rgba(30, 41, 59, 0.18);
  }

  .pc-report-loading-title {
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 10px;
  }

  .pc-report-skeleton-grid {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 8px;
  }

  .model-fit-skeleton-grid {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 8px;
  }

  @media (min-width: 768px) {
    .pc-report-skeleton-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 20px;
    }

    .model-fit-skeleton-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px 14px;
    }
  }
</style>
