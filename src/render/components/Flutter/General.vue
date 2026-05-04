<template>
  <div class="flutter-general">
    <!-- ─── Status Bar ──────────────────────────────────────── -->
    <div class="fg-status-bar">
      <div
        v-for="card in statusCards"
        :key="card.key"
        class="fg-sc"
        :class="card.ok === true ? 'fg-sc--ok' : card.ok === false ? 'fg-sc--err' : 'fg-sc--warn'"
      >
        <div
          class="fg-sc-icon"
          :class="card.ok === true ? 'fg-sc-icon--ok' : card.ok === false ? 'fg-sc-icon--err' : 'fg-sc-icon--warn'"
        >
          <span v-if="card.ok === true">✓</span>
          <span v-else-if="card.ok === false">✗</span>
          <span v-else>!</span>
        </div>
        <div class="fg-sc-body">
          <div class="fg-sc-label">{{ card.label }}</div>
          <div class="fg-sc-val">{{ card.value }}</div>
        </div>
        <div
          class="fg-sc-bar"
          :class="card.ok === true ? 'fg-sc-bar--ok' : card.ok === false ? 'fg-sc-bar--err' : 'fg-sc-bar--warn'"
        ></div>
      </div>
    </div>

    <!-- ─── Two-Column Body ────────────────────────────────── -->
    <div class="fg-body">
      <!-- Left: info panels -->
      <div class="fg-left">
        <!-- SDK Details -->
        <el-card shadow="never" class="fg-card">
          <template #header>
            <div class="fg-card-hd">
              <span>{{ I18nT('flutter.sdkDetails') }}</span>
              <el-button link size="small" :loading="sdkLoading" @click="loadSdkInfo">
                {{ I18nT('base.refresh') }}
              </el-button>
            </div>
          </template>
          <el-skeleton v-if="sdkLoading" :rows="5" animated />
          <template v-else>
            <div v-if="!sdkInfo.flutterVersion && !sdkInfo.flutterBin" class="fg-empty">
              {{ I18nT('flutter.sdkNotFound') }}
            </div>
            <template v-else>
              <div class="fg-row">
                <span class="fg-k">Flutter</span>
                <span class="fg-v fg-bold">{{ sdkInfo.flutterVersion || '—' }}</span>
              </div>
              <div class="fg-row">
                <span class="fg-k">Dart</span>
                <span class="fg-v fg-bold">{{ sdkInfo.dartVersion || '—' }}</span>
              </div>
              <div class="fg-row">
                <span class="fg-k">Channel</span>
                <span class="fg-v">
                  <el-tag size="small" :type="channelTagType">{{ sdkInfo.channel || '—' }}</el-tag>
                </span>
              </div>
              <div class="fg-row">
                <span class="fg-k">{{ I18nT('flutter.source') }}</span>
                <span class="fg-v">{{ sdkInfo.source ? sourceLabel : '—' }}</span>
              </div>
              <div class="fg-row">
                <span class="fg-k">{{ I18nT('flutter.searchDirs') }}</span>
                <span class="fg-v fg-search-head">
                  <span>{{ I18nT('flutter.scanned', sdkInfo.searchDirs.length) }}</span>
                  <el-button
                    v-if="sdkInfo.searchDirs.length"
                    link
                    size="small"
                    @click="showSearchDirs = !showSearchDirs"
                  >
                    {{ showSearchDirs ? I18nT('flutter.hide') : I18nT('flutter.show') }}
                  </el-button>
                  <el-button
                    v-if="sdkInfo.searchDirs.length"
                    link
                    size="small"
                    @click="copySearchDirs"
                  >
                    {{ I18nT('flutter.copyPaths') }}
                  </el-button>
                </span>
              </div>
              <div v-if="showSearchDirs && sdkInfo.searchDirs.length" class="fg-search-list">
                <div
                  v-for="dir in sdkInfo.searchDirs"
                  :key="dir"
                  class="fg-search-item fg-mono"
                  :title="dir"
                >
                  {{ dir }}
                </div>
              </div>
              <div class="fg-row">
                <span class="fg-k">Engine</span>
                <span class="fg-v fg-mono">{{ sdkInfo.engineRevision?.slice(0, 10) || '—' }}</span>
              </div>
              <div class="fg-row">
                <span class="fg-k">Build Date</span>
                <span class="fg-v">{{ sdkInfo.buildDate || '—' }}</span>
              </div>
              <div class="fg-row">
                <span class="fg-k">Binary</span>
                <span class="fg-v fg-mono fg-truncate" :title="sdkInfo.flutterBin">
                  {{ sdkInfo.flutterBin || I18nT('flutter.notFound') }}
                </span>
              </div>
            </template>
          </template>
        </el-card>

        <!-- Environment Variables -->
        <el-card shadow="never" class="fg-card fg-mt">
          <template #header>
            <div class="fg-card-hd"><span>{{ I18nT('flutter.environment') }}</span></div>
          </template>
          <div v-for="(val, key) in envVars" :key="key" class="fg-row">
            <span class="fg-k fg-k--env">{{ key }}</span>
            <span class="fg-v fg-mono fg-truncate" :title="String(val)">{{ val || '—' }}</span>
          </div>
        </el-card>

        <!-- Doctor Snapshot -->
        <el-card shadow="never" class="fg-card fg-mt">
          <template #header>
            <div class="fg-card-hd">
              <span>{{ I18nT('flutter.doctorSnapshot') }}</span>
              <el-button link size="small" :loading="doctorLoading" @click="loadDoctor">
                {{ I18nT('base.refresh') }}
              </el-button>
            </div>
          </template>
          <el-skeleton v-if="doctorLoading" :rows="5" animated />
          <template v-else>
            <div v-if="!doctorItems.length" class="fg-empty">{{ I18nT('flutter.doctorClickRefresh') }}</div>
            <template v-else>
              <div class="fg-doc-badges">
                <el-tag size="small" type="success">
                  {{ doctorItems.filter((i) => i.status === 'ok').length }} OK
                </el-tag>
                <el-tag size="small" type="warning">
                  {{ doctorItems.filter((i) => i.status === 'warning').length }} Warn
                </el-tag>
                <el-tag size="small" type="danger">
                  {{ doctorItems.filter((i) => i.status === 'error').length }} Error
                </el-tag>
              </div>
              <div v-for="item in doctorItems" :key="item.title" class="fg-doc-row">
                <span class="fg-doc-icon" :class="`fg-doc-icon--${item.status}`">
                  {{
                    item.status === 'ok'
                      ? '✓'
                      : item.status === 'warning'
                        ? '!'
                        : item.status === 'error'
                          ? '✗'
                          : '?'
                  }}
                </span>
                <span class="fg-doc-label">{{ item.title }}</span>
              </div>
            </template>
          </template>
        </el-card>
      </div>

      <!-- Right: Command Center + Console -->
      <div class="fg-right">
        <!-- Command Center card -->
        <el-card shadow="never" class="fg-card">
          <template #header>
            <div class="fg-card-hd">
              <span>{{ I18nT('flutter.commandCenter') }}</span>
              <span class="fg-run-badge" :class="running ? 'fg-run-badge--active' : ''">
                {{ running ? activeCmd : I18nT('flutter.idle') }}
              </span>
            </div>
          </template>

          <el-tabs v-model="cmdTab" class="fg-tabs">
            <!-- Flutter SDK tab -->
            <el-tab-pane label="Flutter SDK" name="sdk">
              <div class="fg-tab-pane">
                <p class="fg-tab-desc">Upgrade Flutter and manage channels.</p>
                <div class="fg-btn-row">
                  <el-button size="small" type="primary" :loading="running" @click="runCmd('upgrade', '')">
                    flutter upgrade
                  </el-button>
                  <el-button size="small" :loading="running" @click="runCmd('channel-list', '')">
                    List channels
                  </el-button>
                </div>
                <div class="fg-sep-label">Switch channel:</div>
                <div class="fg-btn-row">
                  <el-button size="small" :loading="running" @click="runCmd('channel-switch', 'stable')">stable</el-button>
                  <el-button size="small" :loading="running" @click="runCmd('channel-switch', 'beta')">beta</el-button>
                  <el-button size="small" :loading="running" @click="runCmd('channel-switch', 'master')">master</el-button>
                </div>
              </div>
            </el-tab-pane>

            <!-- Pub Tools tab -->
            <el-tab-pane label="Pub Tools" name="pub">
              <div class="fg-tab-pane">
                <p class="fg-tab-desc">Manage dependencies for your Flutter project.</p>
                <div class="fg-dir-row">
                  <el-input v-model="projectDir" size="small" placeholder="Flutter project directory" readonly>
                    <template #append>
                      <el-button size="small" @click="chooseDir">Browse</el-button>
                    </template>
                  </el-input>
                </div>
                <div class="fg-btn-row fg-mt-sm">
                  <el-button size="small" type="primary" :loading="running" :disabled="!projectDir" @click="runCmd('pub-get', projectDir)">pub get</el-button>
                  <el-button size="small" :loading="running" :disabled="!projectDir" @click="runCmd('pub-upgrade', projectDir)">pub upgrade</el-button>
                  <el-button size="small" :loading="running" :disabled="!projectDir" @click="runCmd('pub-outdated', projectDir)">pub outdated</el-button>
                  <el-button size="small" :loading="running" :disabled="!projectDir" @click="runCmd('pub-deps', projectDir)">pub deps</el-button>
                </div>
              </div>
            </el-tab-pane>

            <!-- Build tab -->
            <el-tab-pane label="Build" name="build">
              <div class="fg-tab-pane">
                <p class="fg-tab-desc">Build Flutter app for different targets.</p>
                <div class="fg-dir-row">
                  <el-input v-model="projectDir" size="small" placeholder="Flutter project directory" readonly>
                    <template #append>
                      <el-button size="small" @click="chooseDir">Browse</el-button>
                    </template>
                  </el-input>
                </div>
                <div class="fg-btn-row fg-mt-sm">
                  <el-button size="small" :loading="running" :disabled="!projectDir" @click="runCmd('build-apk', projectDir)">APK debug</el-button>
                  <el-button size="small" type="primary" :loading="running" :disabled="!projectDir" @click="runCmd('build-apk-release', projectDir)">APK release</el-button>
                  <el-button size="small" :loading="running" :disabled="!projectDir" @click="runCmd('build-web', projectDir)">Web</el-button>
                  <el-button size="small" :loading="running" :disabled="!projectDir" @click="runCmd('build-windows', projectDir)">Windows</el-button>
                  <el-button size="small" :loading="running" :disabled="!projectDir" @click="runCmd('clean', projectDir)">Clean</el-button>
                </div>
              </div>
            </el-tab-pane>

            <!-- Quality tab -->
            <el-tab-pane label="Quality" name="quality">
              <div class="fg-tab-pane">
                <p class="fg-tab-desc">Code analysis, formatting, and testing.</p>
                <div class="fg-dir-row">
                  <el-input v-model="projectDir" size="small" placeholder="Flutter project directory" readonly>
                    <template #append>
                      <el-button size="small" @click="chooseDir">Browse</el-button>
                    </template>
                  </el-input>
                </div>
                <div class="fg-btn-row fg-mt-sm">
                  <el-button size="small" :loading="running" :disabled="!projectDir" @click="runCmd('analyze', projectDir)">flutter analyze</el-button>
                  <el-button size="small" :loading="running" :disabled="!projectDir" @click="runCmd('test', projectDir)">flutter test</el-button>
                  <el-button size="small" :loading="running" :disabled="!projectDir" @click="runCmd('format', projectDir)">dart format</el-button>
                </div>
              </div>
            </el-tab-pane>

            <!-- Doctor tab -->
            <el-tab-pane label="Doctor" name="doctor-cmd">
              <div class="fg-tab-pane">
                <p class="fg-tab-desc">Run full verbose Flutter doctor diagnostic.</p>
                <div class="fg-btn-row">
                  <el-button size="small" type="primary" :loading="running" @click="runCmd('doctor', '')">
                    flutter doctor -v
                  </el-button>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-card>

        <!-- Console Output -->
        <div class="fg-console fg-mt">
          <div class="fg-console-hd">
            <div class="fg-console-title">
              <span class="fg-dot" :class="running ? 'fg-dot--run' : 'fg-dot--idle'"></span>
              <span>{{ activeCmd ? `$ flutter ${activeCmd}` : I18nT('flutter.consoleOutput') }}</span>
            </div>
            <div class="fg-console-acts">
              <el-button link size="small" :disabled="!output" @click="copyOutput">{{ I18nT('base.copy') }}</el-button>
              <el-button link size="small" :disabled="!output" @click="output = ''">{{ I18nT('base.clean') }}</el-button>
            </div>
          </div>
          <pre ref="consolePre" class="fg-console-pre">{{ output || I18nT('flutter.ready') }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, reactive, ref } from 'vue'
  import IPC from '@/util/IPC'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { I18nT } from '@lang/index'
  import { dialog, clipboard } from '@/util/NodeFn'
  import { AppStore } from '@/store/app'

  const appStore = AppStore()

  // ── SDK info ──────────────────────────────────────────────
  const sdkLoading = ref(false)
  const sdkInfo = reactive({
    ok: false,
    flutterBin: '',
    source: '',
    searchDirs: [] as string[],
    flutterVersion: '',
    dartVersion: '',
    channel: '',
    engineRevision: '',
    buildDate: '',
    raw: ''
  })

  // ── Doctor snapshot ───────────────────────────────────────
  const doctorLoading = ref(false)
  const doctorItems = ref<Array<{ status: string; title: string }>>([])

  // ── Android / Env ─────────────────────────────────────────
  const envVars = reactive({
    ANDROID_HOME: '',
    ANDROID_SDK_ROOT: '',
    JAVA_HOME: '',
    FLUTTER_ROOT: ''
  })
  const androidPassed = ref(0)
  const androidTotal = ref(0)
  const devicesOnline = ref(0)
  const devicesTotal = ref(0)

  // ── Commands ──────────────────────────────────────────────
  const running = ref(false)
  const activeCmd = ref('')
  const output = ref('')
  const showSearchDirs = ref(false)
  const projectDir = ref('')
  const cmdTab = ref('sdk')
  const consolePre = ref<HTMLElement | null>(null)

  // ── Computed ──────────────────────────────────────────────
  const channelTagType = computed(() => {
    const c = sdkInfo.channel
    if (c === 'stable') return 'success'
    if (c === 'beta') return 'warning'
    if (c === 'master' || c === 'main') return 'danger'
    return 'info'
  })

  const sourceLabel = computed(() => {
    switch (sdkInfo.source) {
      case 'path':
        return I18nT('flutter.sourcePath')
      case 'default':
        return I18nT('flutter.sourceDefault')
      case 'custom':
        return I18nT('flutter.sourceCustom')
      case 'flyenv':
        return I18nT('flutter.sourceFlyenv')
      default:
        return I18nT('flutter.sourceUnknown')
    }
  })

  const statusCards = computed(() => [
    {
      key: 'flutter',
      label: 'Flutter',
      value: sdkInfo.flutterVersion || (sdkLoading.value ? 'Loading…' : 'Not found'),
      ok: sdkInfo.flutterVersion ? true : false
    },
    {
      key: 'dart',
      label: 'Dart',
      value: sdkInfo.dartVersion || (sdkLoading.value ? 'Loading…' : 'Not found'),
      ok: sdkInfo.dartVersion ? true : false
    },
    {
      key: 'channel',
      label: 'Channel',
      value: sdkInfo.channel || '—',
      ok: sdkInfo.channel === 'stable' ? true : sdkInfo.channel ? (null as unknown as boolean) : false
    },
    {
      key: 'android',
      label: 'Android SDK',
      value: androidTotal.value ? `${androidPassed.value}/${androidTotal.value} ready` : 'Unknown',
      ok:
        androidTotal.value > 0 && androidPassed.value === androidTotal.value
          ? true
          : androidPassed.value > 0
            ? (null as unknown as boolean)
            : false
    },
    {
      key: 'devices',
      label: 'ADB Devices',
      value: devicesTotal.value ? `${devicesOnline.value} online / ${devicesTotal.value}` : 'No devices',
      ok: devicesOnline.value > 0 ? true : devicesTotal.value > 0 ? (null as unknown as boolean) : false
    }
  ])

  // ── IPC helper ────────────────────────────────────────────
  const sendFlutter = (fn: string, ...args: any[]) =>
    new Promise<any>((resolve) => {
      IPC.send('app-fork:flutter', fn, ...args).then((key: string, res: any) => {
        IPC.off(key)
        resolve(res)
      })
    })

  // ── Loaders ───────────────────────────────────────────────
  const loadSdkInfo = async () => {
    if (sdkLoading.value) return
    sdkLoading.value = true
    showSearchDirs.value = false
    const setup = JSON.parse(JSON.stringify(appStore.config.setup))
    const res = await sendFlutter('flutterSdkInfo', setup)
    sdkLoading.value = false
    if (res?.code === 0) {
      Object.assign(sdkInfo, res.data ?? {})
    }
  }

  const loadDoctor = async () => {
    if (doctorLoading.value) return
    doctorLoading.value = true
    const setup = JSON.parse(JSON.stringify(appStore.config.setup))
    const res = await sendFlutter('flutterDoctor', setup)
    doctorLoading.value = false
    if (res?.code === 0) {
      doctorItems.value = res.data?.items ?? []
    }
  }

  const loadAndroid = async () => {
    const [rRes, dRes] = await Promise.all([
      sendFlutter('androidReadiness'),
      sendFlutter('androidDevices')
    ])
    if (rRes?.code === 0) {
      const s = rRes.data?.summary ?? {}
      androidPassed.value = Number(s.passed ?? 0)
      androidTotal.value = Number(s.total ?? 0)
      const env = rRes.data?.env ?? {}
      envVars.ANDROID_HOME = env.ANDROID_HOME ?? ''
      envVars.ANDROID_SDK_ROOT = env.ANDROID_SDK_ROOT ?? ''
      envVars.JAVA_HOME = env.JAVA_HOME ?? ''
      envVars.FLUTTER_ROOT = ''
    }
    if (dRes?.code === 0) {
      const s = dRes.data?.summary ?? {}
      devicesOnline.value = Number(s.online ?? 0)
      devicesTotal.value = Number(s.total ?? 0)
    }
  }

  // ── Commands ──────────────────────────────────────────────
  type AdvancedAction =
    | 'doctor'
    | 'upgrade'
    | 'channel-list'
    | 'channel-switch'
    | 'pub-get'
    | 'pub-upgrade'
    | 'pub-outdated'
    | 'pub-deps'
    | 'clean'
    | 'analyze'
    | 'test'
    | 'format'
    | 'build-apk'
    | 'build-apk-release'
    | 'build-web'
    | 'build-windows'

  const runCmd = async (action: AdvancedAction, arg: string) => {
    if (running.value) return
    running.value = true
    activeCmd.value = action
    output.value = `$ flutter ${action}${arg ? `  (${arg})` : ''}\n${'─'.repeat(48)}\n`

    const setup = JSON.parse(JSON.stringify(appStore.config.setup))
    const res = await sendFlutter('flutterAdvancedAction', action, arg, setup)

    running.value = false
    activeCmd.value = ''

    if (res?.code !== 0) {
      output.value += res?.msg ?? 'IPC error'
      MessageError(res?.msg ?? 'IPC error')
      return
    }

    const data = res?.data ?? {}
    output.value += data?.output ?? data?.message ?? ''

    await nextTick()
    if (consolePre.value) {
      consolePre.value.scrollTop = consolePre.value.scrollHeight
    }

    if (data?.ok) {
      MessageSuccess(data?.message ?? 'Done')
      if (action === 'upgrade' || action === 'channel-switch') {
        loadSdkInfo()
      }
    } else {
      MessageError(data?.message ?? 'Command failed')
    }
  }

  const chooseDir = async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
    })
    if (!canceled && filePaths?.length) {
      projectDir.value = filePaths[0]
    }
  }

  const copyOutput = () => {
    if (!output.value) return
    clipboard.writeText(output.value)
    MessageSuccess(I18nT('flutter.copiedToClipboard'))
  }

  const copySearchDirs = () => {
    if (!sdkInfo.searchDirs.length) return
    clipboard.writeText(sdkInfo.searchDirs.join('\n'))
    MessageSuccess(I18nT('flutter.copiedToClipboard'))
  }

  // ── Init ──────────────────────────────────────────────────
  Promise.all([loadSdkInfo(), loadDoctor(), loadAndroid()])
</script>

<style lang="scss" scoped>
  .flutter-general {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    padding: 2px 0 4px;
    overflow: hidden;
  }

  /* ── Status Bar ─────────────────────────────────────────── */
  .fg-status-bar {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    flex-shrink: 0;
  }

  .fg-sc {
    position: relative;
    border-radius: 10px;
    padding: 11px 14px 11px 12px;
    background: var(--el-bg-color-overlay);
    border: 1px solid var(--el-border-color-lighter);
    display: flex;
    align-items: center;
    gap: 10px;
    overflow: hidden;
    transition: box-shadow 0.2s, border-color 0.2s;
    min-width: 0;

    &:hover {
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
    }

    &--ok {
      border-color: var(--el-color-success-light-5);
    }
    &--err {
      border-color: var(--el-color-danger-light-5);
    }
    &--warn {
      border-color: var(--el-color-warning-light-5);
    }
  }

  .fg-sc-icon {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;

    &--ok {
      background: var(--el-color-success-light-8);
      color: var(--el-color-success);
    }
    &--err {
      background: var(--el-color-danger-light-8);
      color: var(--el-color-danger);
    }
    &--warn {
      background: var(--el-color-warning-light-8);
      color: var(--el-color-warning);
    }
  }

  .fg-sc-body {
    flex: 1;
    min-width: 0;
  }

  .fg-sc-label {
    font-size: 10px;
    opacity: 0.5;
    margin-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }

  .fg-sc-val {
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fg-sc-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;

    &--ok {
      background: var(--el-color-success);
    }
    &--err {
      background: var(--el-color-danger);
    }
    &--warn {
      background: var(--el-color-warning);
    }
  }

  /* ── Body layout ─────────────────────────────────────────── */
  .fg-body {
    display: flex;
    gap: 10px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .fg-left {
    width: 272px;
    flex-shrink: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .fg-right {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  }

  .fg-mt {
    margin-top: 10px;
  }

  .fg-mt-sm {
    margin-top: 8px;
  }

  /* ── Card heading ────────────────────────────────────────── */
  .fg-card-hd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 500;
    font-size: 13px;
  }

  /* ── Info rows ───────────────────────────────────────────── */
  .fg-row {
    display: flex;
    align-items: center;
    padding: 5px 0;
    gap: 6px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    font-size: 12px;

    &:last-child {
      border-bottom: none;
    }
  }

  .fg-k {
    color: var(--el-text-color-secondary);
    white-space: nowrap;
    width: 74px;
    flex-shrink: 0;
    font-size: 11px;

    &--env {
      width: 120px;
      font-size: 10px;
    }
  }

  .fg-v {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fg-bold {
    font-weight: 600;
  }

  .fg-mono {
    font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
    font-size: 11px;
  }

  .fg-truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fg-empty {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    padding: 6px 0;
  }

  .fg-search-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .fg-search-list {
    border: 1px dashed var(--el-border-color);
    border-radius: 6px;
    padding: 6px;
    margin: -2px 0 6px;
    max-height: 120px;
    overflow-y: auto;
    background: var(--el-fill-color-lighter);
  }

  .fg-search-item {
    font-size: 10px;
    line-height: 1.5;
    padding: 2px 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Doctor snapshot ─────────────────────────────────────── */
  .fg-doc-badges {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .fg-doc-row {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 0;
    font-size: 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    &:last-child {
      border-bottom: none;
    }
  }

  .fg-doc-icon {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;

    &--ok {
      background: var(--el-color-success-light-7);
      color: var(--el-color-success);
    }
    &--warning {
      background: var(--el-color-warning-light-7);
      color: var(--el-color-warning);
    }
    &--error {
      background: var(--el-color-danger-light-7);
      color: var(--el-color-danger);
    }
    &--unknown {
      background: var(--el-color-info-light-7);
      color: var(--el-color-info);
    }
  }

  .fg-doc-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  /* ── Command Center ──────────────────────────────────────── */
  .fg-run-badge {
    font-size: 11px;
    padding: 2px 10px;
    border-radius: 12px;
    background: var(--el-color-info-light-9);
    color: var(--el-text-color-secondary);
    transition: all 0.2s;

    &--active {
      background: var(--el-color-primary-light-8);
      color: var(--el-color-primary);
      animation: fg-pulse 1.2s ease-in-out infinite;
    }
  }

  @keyframes fg-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .fg-tabs {
    :deep(.el-tabs__header) {
      margin-bottom: 0;
    }
  }

  .fg-tab-pane {
    padding: 12px 0 4px;
  }

  .fg-tab-desc {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 10px;
  }

  .fg-sep-label {
    font-size: 11px;
    color: var(--el-text-color-secondary);
    margin: 10px 0 6px;
  }

  .fg-btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .fg-dir-row {
    max-width: 480px;
  }

  /* ── Console ─────────────────────────────────────────────── */
  .fg-console {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--el-border-color);
  }

  .fg-console-hd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 12px;
    background: var(--el-bg-color-page);
    border-bottom: 1px solid var(--el-border-color);
    flex-shrink: 0;
  }

  .fg-console-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 500;
  }

  .fg-console-acts {
    display: flex;
    gap: 4px;
  }

  .fg-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;

    &--idle {
      background: var(--el-color-success);
    }

    &--run {
      background: var(--el-color-primary);
      animation: fg-pulse 1s ease-in-out infinite;
    }
  }

  .fg-console-pre {
    flex: 1;
    margin: 0;
    padding: 12px 14px;
    font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
    font-size: 12px;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-all;
    overflow-y: auto;
    background: #1a1a1e;
    color: #cdd6f4;
    min-height: 0;
    scrollbar-width: thin;
    scrollbar-color: #45475a #1a1a1e;
  }
</style>
