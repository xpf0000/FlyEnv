<template>
  <div class="windows-extensions flex h-full min-h-0 flex-col gap-3">
    <el-card v-if="entry.profile" shadow="never" class="php-extension-profile">
      <div class="flex flex-col gap-2 text-sm select-text">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold">PHP {{ entry.profile.version }}</span>
          <el-tag size="small" type="info" disable-transitions>{{
            entry.profile.architecture
          }}</el-tag>
          <el-tag size="small" type="info" disable-transitions>{{ entry.profile.build }}</el-tag>
          <el-popover trigger="click" placement="bottom-end" :width="360">
            <div class="flex flex-col gap-3 text-sm">
              <p>{{ I18nT('php.windowsCatalogHelp') }}</p>
              <p>{{ I18nT('php.windowsInstallHelp') }}</p>
            </div>
            <template #reference>
              <el-button class="!ml-auto" link :icon="QuestionFilled">{{
                I18nT('php.windowsHelp')
              }}</el-button>
            </template>
          </el-popover>
        </div>
        <div class="flex gap-3 text-[var(--el-text-color-secondary)]">
          <span class="w-14 shrink-0">php.exe</span>
          <span class="min-w-0 break-all">{{ entry.profile.bin }}</span>
        </div>
        <div class="flex gap-3 text-[var(--el-text-color-secondary)]">
          <span class="w-14 shrink-0">php.ini</span>
          <span class="min-w-0 break-all">{{ entry.profile.ini }}</span>
        </div>
      </div>
    </el-card>

    <div class="flex shrink-0 gap-2">
      <el-input
        v-model="query"
        clearable
        :placeholder="I18nT('php.windowsSearchPlaceholder')"
        @keyup.enter="search"
        @clear="search"
      />
      <el-button :loading="entry.fetching" :disabled="entry.installing" @click="search">{{
        I18nT('php.windowsSearch')
      }}</el-button>
      <el-button
        :loading="entry.fetching"
        :disabled="entry.installing || entry.preparing"
        @click="refreshCatalog"
        >{{ I18nT('php.windowsRefresh') }}</el-button
      >
    </div>
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <el-radio-group v-model="filter" size="small">
        <el-radio-button value="all">
          {{ I18nT('php.windowsAll') }} ({{ rows.length }})
        </el-radio-button>
        <el-radio-button value="loaded">
          {{ I18nT('php.loadedExtensions') }} ({{ loadedCount }})
        </el-radio-button>
        <el-radio-button value="notLoaded">
          {{ I18nT('php.windowsUnloaded') }} ({{ rows.length - loadedCount }})
        </el-radio-button>
      </el-radio-group>
      <el-button v-if="entry.operation" link type="primary" @click="showOperation = true">
        <el-icon v-if="entry.installing" class="is-loading mr-1"><Loading /></el-icon>
        {{ I18nT(entry.installing ? 'php.windowsInProgress' : 'php.windowsLastOperation') }}
      </el-button>
    </div>

    <el-alert
      v-if="entry.partial"
      :key="entry.lastQuery"
      class="shrink-0"
      type="warning"
      show-icon
      :title="I18nT('php.windowsPartialCatalog')"
    />
    <el-alert
      v-if="entry.error && entry.error !== entry.operation?.error"
      class="shrink-0"
      type="error"
      show-icon
      :title="entry.error"
    />

    <el-table
      v-loading="entry.fetching"
      :data="tableData"
      row-key="key"
      height="100%"
      class="flex-1 min-h-0 select-text"
    >
      <el-table-column :label="I18nT('php.extension')" min-width="170">
        <template #default="{ row }">
          <div class="font-medium">{{ row.name }}</div>
          <div v-if="row.packageName" class="text-xs text-[var(--el-text-color-secondary)]">
            {{ row.packageName }}
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('php.windowsDescription')" min-width="220">
        <template #default="{ row }">
          <span :class="{ 'text-[var(--el-text-color-placeholder)]': !row.description }">{{
            row.description ||
            I18nT(row.packageName ? 'php.windowsNoDescription' : 'php.windowsLocalDescription')
          }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('common.label.source')" width="115">
        <template #default="{ row }">
          <div class="flex flex-col items-start gap-1 text-xs">
            <span v-if="row.configuredName">php.ini</span>
            <span v-if="row.packageName">{{
              I18nT(row.source === 'pecl' ? 'php.windowsSourcePecl' : 'php.windowsSourcePie')
            }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('common.label.status')" width="150" align="center">
        <template #default="{ row }">
          <el-tag
            disable-transitions
            :type="
              row.status === 'loaded' ? 'success' : row.status === 'unloaded' ? 'warning' : 'info'
            "
          >
            {{
              I18nT(
                row.status === 'loaded'
                  ? 'php.loadedExtensions'
                  : row.status === 'unloaded'
                    ? 'php.windowsNotLoaded'
                    : 'php.windowsNotConfigured'
              )
            }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('common.label.action')" width="150" align="center">
        <template #default="{ row }">
          <div class="flex flex-wrap items-center justify-center gap-2">
            <el-button
              v-if="row.packageName && row.status !== 'loaded'"
              type="primary"
              size="small"
              :loading="entry.preparing && entry.preparation?.name !== row.packageName"
              :disabled="!!windowsExtensions.installingBin || entry.fetching"
              @click="prepareInstall(row.packageName)"
              >{{
                I18nT(row.status === 'unloaded' ? 'php.windowsRepair' : 'base.install')
              }}</el-button
            >
            <el-button
              v-if="row.configuredName"
              class="!ml-0"
              size="small"
              :loading="isOperating(row.configuredName, 'disable')"
              :disabled="!!windowsExtensions.installingBin || entry.fetching"
              @click="windowsExtensions.disable(version, row.configuredName)"
              >{{ I18nT('common.action.disable') }}</el-button
            >
            <el-tooltip
              v-if="row.status === 'loaded' && !row.configuredName"
              :content="I18nT('php.windowsLoadedExternally')"
            >
              <span class="text-[var(--el-text-color-secondary)]">—</span>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>
      <template #empty>{{ I18nT('php.windowsEmptyCatalog') }}</template>
    </el-table>

    <el-dialog
      v-model="showPreparation"
      :title="I18nT('php.windowsChooseVersion')"
      class="php-extension-version-dialog"
      width="min(640px, calc(100vw - 32px))"
      top="10vh"
      append-to-body
    >
      <div v-if="entry.preparation" class="extension-preparation">
        <div class="extension-preparation__summary">
          <div class="extension-preparation__heading">
            <strong>{{ entry.preparation.name.replace(/^pecl:/, '') }}</strong>
            <el-tag size="small" type="info" disable-transitions>{{
              I18nT(
                entry.preparation.source === 'pecl'
                  ? 'php.windowsSourcePecl'
                  : 'php.windowsSourcePie'
              )
            }}</el-tag>
          </div>
          <p class="extension-preparation__target">
            PHP {{ entry.preparation.profile.version }} · {{ entry.preparation.profile.build }} ·
            {{ entry.preparation.profile.architecture }}
          </p>
          <a
            class="extension-preparation__link"
            :href="entry.preparation.homepage"
            @click.prevent="openExternal(entry.preparation.homepage)"
            >{{ entry.preparation.homepage }}</a
          >
        </div>
        <div class="extension-preparation__field">
          <label for="php-extension-release">{{ I18nT('base.version') }}</label>
          <el-select
            id="php-extension-release"
            v-model="selectedRelease"
            :loading="entry.preparing"
            :disabled="entry.preparing"
            @change="checkRelease"
          >
            <el-option
              v-for="release in entry.preparation.releases"
              :key="release.version"
              :value="release.version"
              :label="release.version"
            />
          </el-select>
        </div>
        <el-alert
          v-if="selectedStatus === false"
          type="error"
          :title="I18nT('php.windowsIncompatibleRelease')"
        />
        <el-alert v-if="selectedError" type="error" :title="selectedError"
          ><el-button @click="checkRelease(selectedRelease)">{{
            I18nT('php.windowsRetry')
          }}</el-button></el-alert
        >
        <el-alert
          v-else-if="selectedStatus === null && entry.preparation.source === 'pie'"
          type="info"
          :title="I18nT('php.windowsPieWillVerify')"
        />
        <div v-if="selectedUrl" class="extension-preparation__resource">
          <div class="extension-preparation__resource-heading">
            <span>{{ I18nT('php.windowsDownloadLink') }}</span>
            <el-button link type="primary" @click="copy(selectedUrl)">{{
              I18nT('common.action.copy')
            }}</el-button>
          </div>
          <a
            class="extension-preparation__link"
            :href="selectedUrl"
            @click.prevent="openExternal(selectedUrl)"
            >{{ selectedUrl }}</a
          >
        </div>
        <div v-if="entry.preparation.command" class="extension-preparation__resource">
          <div class="extension-preparation__resource-heading">
            <span>{{ I18nT('php.windowsInstallCommand') }}</span>
            <el-button link type="primary" @click="copy(entry.preparation.command)">{{
              I18nT('php.windowsCopyCommand')
            }}</el-button>
          </div>
          <pre class="extension-preparation__command">{{ entry.preparation.command }}</pre>
        </div>
      </div>
      <template #footer>
        <el-button @click="showPreparation = false">{{ I18nT('common.action.close') }}</el-button>
        <el-button
          type="primary"
          :loading="entry.installing"
          :disabled="
            !selectedRelease ||
            selectedStatus === false ||
            (entry.preparation?.source === 'pecl' && selectedStatus !== true) ||
            entry.preparing
          "
          @click="installPrepared"
          >{{ I18nT('base.install') }}</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="showOperation"
      :title="I18nT('php.windowsLastOperation')"
      width="min(760px, 90vw)"
      append-to-body
      :close-on-click-modal="false"
    >
      <div v-if="entry.operation" class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <el-icon v-if="entry.installing" class="is-loading"><Loading /></el-icon>
          <span>{{
            I18nT(entry.operation.type === 'install' ? 'base.install' : 'common.action.disable')
          }}</span>
          <span class="font-medium break-all">{{ entry.operation.name }}</span>
        </div>
        <div
          v-if="entry.operationPreparation"
          class="flex flex-col items-start gap-1 rounded border p-3"
        >
          <span
            >{{
              I18nT(
                entry.operationPreparation.source === 'pecl'
                  ? 'php.windowsSourcePecl'
                  : 'php.windowsSourcePie'
              )
            }}
            · {{ entry.operationRelease }}</span
          >
          <el-button
            v-if="entry.operationPreparation.homepage"
            link
            type="primary"
            @click="openExternal(entry.operationPreparation.homepage)"
            >{{ entry.operationPreparation.homepage }}</el-button
          >
          <el-button
            v-if="entry.operationPreparation.command"
            link
            @click="copy(entry.operationPreparation.command)"
            >{{ I18nT('php.windowsCopyCommand') }}</el-button
          >
          <pre v-if="entry.operationPreparation.command" class="select-text break-all">{{
            entry.operationPreparation.command
          }}</pre>
          <el-button
            v-if="
              entry.operationPreparation.releases.find((r) => r.version === entry.operationRelease)
                ?.url
            "
            link
            type="primary"
            @click="
              openExternal(
                entry.operationPreparation.releases.find(
                  (r) => r.version === entry.operationRelease
                )!.url!
              )
            "
            >{{
              entry.operationPreparation.releases.find((r) => r.version === entry.operationRelease)
                ?.url
            }}</el-button
          >
        </div>
        <el-alert
          v-if="entry.operation.status === 'error'"
          type="error"
          show-icon
          :title="entry.operation.error"
        />
        <el-alert
          v-else-if="entry.operation.status !== 'running'"
          :type="entry.operation.status === 'warning' ? 'warning' : 'success'"
          show-icon
          :title="operationMessage"
        >
          <p v-if="entry.operation.type === 'install'">{{ I18nT('php.windowsRestart') }}</p>
          <p v-if="entry.result?.backup" class="break-all select-text">
            {{ I18nT('php.windowsBackup') }}: {{ entry.result.backup }}
          </p>
        </el-alert>
        <pre
          v-if="entry.log"
          class="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-black/5 p-3 text-xs dark:bg-white/5"
          >{{ entry.log }}</pre>
      </div>
      <template #footer>
        <el-button @click="showOperation = false">{{ I18nT('common.action.close') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { Loading, QuestionFilled } from '@element-plus/icons-vue'
  import type { SoftInstalled } from '@shared/app'
  import { I18nT } from '@lang/index'
  import windowsExtensions from './controller'
  import { extensionRows } from './Catalog'
  import type { ExtensionOperation } from './Operation'
  import { shell, clipboard } from '@/util/NodeFn'

  const props = defineProps<{ version: SoftInstalled }>()
  const entry = computed(() => windowsExtensions.entry(props.version))
  const query = ref(entry.value.lastQuery)
  const filter = ref<'all' | 'loaded' | 'notLoaded'>('all')
  const showOperation = ref(false)
  const showPreparation = ref(false)
  const selectedRelease = ref('')
  const selectedItem = computed(() =>
    entry.value.preparation?.releases.find((r) => r.version === selectedRelease.value)
  )
  const selectedStatus = computed(() => selectedItem.value?.compatible ?? null)
  const selectedError = computed(() => selectedItem.value?.error)
  const selectedUrl = computed(() => selectedItem.value?.url)
  let viewGeneration = 0
  let active = true
  onBeforeUnmount(() => {
    active = false
    viewGeneration += 1
  })
  const openExternal = (url: string) => shell.openExternal(url).catch(() => {})
  const copy = (text: string) => clipboard.writeText(text).catch(() => {})
  const prepareInstall = async (name: string) => {
    const generation = ++viewGeneration
    const version = JSON.parse(JSON.stringify(props.version)) as SoftInstalled
    const result = await windowsExtensions.prepare(version, name)
    if (!active || generation !== viewGeneration || props.version.bin !== version.bin || !result)
      return
    selectedRelease.value = result.releases[0]?.version ?? ''
    showPreparation.value = true
  }
  const checkRelease = async (release: string) => {
    const prep = entry.value.preparation
    if (!prep) return
    const generation = viewGeneration
    const version = JSON.parse(JSON.stringify(props.version)) as SoftInstalled
    await windowsExtensions.prepare(version, prep.name, release)
    if (!active || generation !== viewGeneration || props.version.bin !== version.bin) return
  }
  const installPrepared = async () => {
    const name = entry.value.preparation?.name
    if (!name || !selectedRelease.value) return
    const version = JSON.parse(JSON.stringify(props.version)) as SoftInstalled
    const release = selectedRelease.value
    showPreparation.value = false
    showOperation.value = true
    await windowsExtensions.install(version, name, release)
  }
  const rows = computed(() =>
    extensionRows(entry.value.profile, entry.value.packages, entry.value.lastQuery)
  )
  const loadedCount = computed(() => rows.value.filter((row) => row.status === 'loaded').length)
  const tableData = computed(() =>
    rows.value.filter(
      (row) =>
        filter.value === 'all' ||
        (filter.value === 'loaded' ? row.status === 'loaded' : row.status !== 'loaded')
    )
  )
  const operationMessage = computed(() => {
    if (entry.value.operation?.type === 'disable') return I18nT('php.windowsDisableSuccess')
    return entry.value.result?.warning || I18nT('php.windowsInstallSuccess')
  })
  const isOperating = (name: string, type: ExtensionOperation['type']) =>
    entry.value.installing &&
    entry.value.operation?.name === name &&
    entry.value.operation.type === type
  const search = () => windowsExtensions.search(props.version, query.value)
  const refreshCatalog = () => windowsExtensions.search(props.version, query.value, true)
  watch(
    () => props.version.bin,
    () => {
      viewGeneration += 1
      query.value = entry.value.lastQuery
      filter.value = 'all'
      showOperation.value = false
      showPreparation.value = false
      selectedRelease.value = ''
      windowsExtensions.load(props.version)
    },
    { immediate: true }
  )
</script>

<style scoped lang="scss">
  .extension-preparation {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 18px;
    max-height: 60vh;
    overflow-y: auto;
    overflow-wrap: anywhere;

    > * {
      min-width: 0;
      flex-shrink: 0;
    }

    &__summary {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    &__heading,
    &__resource-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    &__heading {
      justify-content: flex-start;

      strong {
        min-width: 0;
        color: var(--el-text-color-primary);
        font-size: 16px;
      }

      .el-tag {
        flex-shrink: 0;
      }
    }

    &__target {
      margin: 0;
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }

    &__field {
      display: flex;
      flex-direction: column;
      gap: 8px;

      label {
        color: var(--el-text-color-primary);
        font-weight: 500;
      }

      .el-select {
        width: 100%;
      }
    }

    &__resource {
      min-width: 0;
      padding: 12px 14px;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 8px;
      background: var(--el-fill-color-light);
    }

    &__resource-heading {
      margin-bottom: 8px;
      color: var(--el-text-color-secondary);
      font-size: 12px;

      .el-button {
        flex-shrink: 0;
      }
    }

    &__link {
      display: block;
      max-width: 100%;
      color: var(--el-color-primary);
      font-size: 13px;
      line-height: 1.65;
      white-space: normal;
      overflow-wrap: anywhere;

      &:hover {
        text-decoration: underline;
      }
    }

    &__command {
      max-width: 100%;
      margin: 0;
      color: var(--el-text-color-regular);
      font-size: 12px;
      line-height: 1.65;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      user-select: text;
    }

    :deep(.el-alert__content) {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }

  .windows-extensions > .el-card.php-extension-profile {
    height: auto;
    flex-shrink: 0;

    :deep(.el-card__body) {
      flex: none;
      padding: 12px;
    }
  }
</style>
