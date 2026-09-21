<template>
  <div class="h-full overflow-hidden">
    <el-scrollbar>
      <div class="p-4 space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">{{ I18nT('setup.pluginsTitle') }}</h2>
            <p class="text-xs text-zinc-500">{{ I18nT('setup.pluginsDescription') }}</p>
          </div>
          <el-button :loading="PluginMarket.loading" @click="refresh">{{
            I18nT('common.action.refresh')
          }}</el-button>
        </div>

        <el-alert
          v-if="PluginMarket.restartRequired"
          :title="I18nT('setup.pluginsRestartTip')"
          type="info"
          :closable="false"
          show-icon
        />

        <el-tabs v-model="tab">
          <el-tab-pane :label="I18nT('setup.pluginsOfficial')" name="official">
            <el-empty
              v-if="!PluginMarket.loading && official.length === 0"
              :description="I18nT('setup.pluginsEmpty')"
            />
            <div v-for="item in official" :key="item.id" class="border-b py-4 last:border-b-0">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex items-center gap-2"
                    ><span class="font-medium">{{ item.name }}</span
                    ><el-tag size="small" type="success">Official</el-tag
                    ><span class="text-xs text-zinc-500">v{{ item.version }}</span></div
                  >
                  <p class="mt-1 text-sm text-zinc-500">{{ item.description || item.id }}</p>
                  <p class="mt-1 text-xs text-zinc-400">{{ item.author || 'FlyEnv' }}</p>
                </div>
                <el-button
                  type="primary"
                  :loading="!!PluginMarket.busyById[item.id]"
                  @click="install(item)"
                  >{{ actionLabel(item) }}</el-button
                >
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane :label="I18nT('setup.pluginsInstalled')" name="installed">
            <el-empty
              v-if="PluginMarket.installed.length === 0"
              :description="I18nT('setup.pluginsEmpty')"
            />
            <div
              v-for="item in PluginMarket.installed"
              :key="item.id"
              class="border-b py-4 last:border-b-0"
            >
              <div class="flex items-center justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex items-center gap-2"
                    ><span class="font-medium truncate">{{ item.name }}</span
                    ><el-tag size="small" effect="plain">v{{ item.version }}</el-tag
                    ><el-tag
                      v-if="item.source && item.source !== 'official'"
                      size="small"
                      type="warning"
                      >Third-party</el-tag
                    ></div
                  >
                  <p class="mt-1 text-xs text-zinc-500">{{ item.id }}</p>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <el-switch
                    :model-value="item.enabled"
                    :loading="!!PluginMarket.busyById[item.id]"
                    @update:model-value="toggle(item, $event)"
                  />
                  <el-button
                    link
                    type="danger"
                    :loading="!!PluginMarket.busyById[item.id]"
                    @click="uninstall(item)"
                    >{{ I18nT('setup.pluginsUninstall') }}</el-button
                  >
                </div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane :label="I18nT('setup.pluginsThirdParty')" name="sources">
            <el-alert
              :title="I18nT('setup.pluginsThirdPartyWarning')"
              type="warning"
              :closable="false"
              show-icon
              class="mb-4"
            />
            <div v-for="item in thirdParty" :key="item.id" class="border-b py-4 last:border-b-0">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex items-center gap-2"
                    ><span class="font-medium">{{ item.name }}</span
                    ><el-tag size="small" type="warning">Third-party</el-tag
                    ><span class="text-xs text-zinc-500">v{{ item.version }}</span></div
                  >
                  <p class="mt-1 text-sm text-zinc-500">{{ item.description || item.id }}</p>
                  <p class="mt-1 text-xs text-zinc-400 truncate">{{ item.source }}</p>
                </div>
                <el-button
                  type="primary"
                  :loading="!!PluginMarket.busyById[item.id]"
                  @click="install(item)"
                  >{{ actionLabel(item) }}</el-button
                >
              </div>
            </div>
            <el-empty
              v-if="thirdParty.length === 0"
              :description="I18nT('setup.pluginsNoThirdPartyCatalog')"
            />

            <div class="flex gap-2 mb-4 mt-6">
              <el-input
                v-model="sourceInput"
                :placeholder="I18nT('setup.pluginsSourcePlaceholder')"
                @keyup.enter="addSource"
              />
              <el-button type="primary" :loading="sourceBusy" @click="addSource">{{
                I18nT('setup.pluginsAddSource')
              }}</el-button>
            </div>
            <el-empty
              v-if="PluginMarket.sources.length === 0"
              :description="I18nT('setup.pluginsNoSources')"
            />
            <div
              v-for="source in PluginMarket.sources"
              :key="source.url"
              class="flex items-center justify-between border-b py-3"
            >
              <span class="text-sm truncate">{{ source.url }}</span>
              <el-button
                link
                type="danger"
                :loading="sourceBusy"
                @click="removeSource(source.url)"
                >{{ I18nT('common.action.delete') }}</el-button
              >
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-scrollbar>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { I18nT } from '@lang/index'
  import { PluginMarket, type PluginCatalogItem } from './controller'

  const tab = ref('official')
  const sourceInput = ref('')
  const sourceBusy = ref(false)
  const official = computed(() => PluginMarket.catalog.filter((item) => item.official === true))
  const thirdParty = computed(() => PluginMarket.catalog.filter((item) => item.official !== true))

  const actionLabel = (item: PluginCatalogItem) => {
    const action = PluginMarket.actionFor(item)
    if (action === 'update') return I18nT('setup.pluginsUpdate')
    if (action === 'reinstall') return I18nT('setup.pluginsReinstall')
    return I18nT('setup.pluginsInstall')
  }

  const refresh = () =>
    PluginMarket.refresh().catch((error) => ElMessage.error(error?.message ?? String(error)))

  const install = async (item: PluginCatalogItem) => {
    try {
      if (
        PluginMarket.isThirdParty(item) &&
        !PluginMarket.acknowledgedSources.has(item.source ?? '')
      ) {
        await ElMessageBox.confirm(
          I18nT('setup.pluginsThirdPartyInstallConfirm'),
          I18nT('setup.pluginsTitle'),
          {
            confirmButtonText: I18nT('base.confirm'),
            cancelButtonText: I18nT('base.cancel'),
            type: 'warning'
          }
        )
      }
      await PluginMarket.install(item, true)
      await askRestart()
    } catch (error: any) {
      if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message ?? String(error))
    }
  }

  const toggle = async (item: PluginCatalogItem, enabled: boolean) => {
    try {
      await PluginMarket.toggle(item, enabled)
      await askRestart()
    } catch (error: any) {
      ElMessage.error(error?.message ?? String(error))
    }
  }

  const uninstall = async (item: PluginCatalogItem) => {
    try {
      await ElMessageBox.confirm(I18nT('setup.pluginsUninstallConfirm'), item.name, {
        type: 'warning'
      })
      await PluginMarket.uninstall(item)
      await askRestart()
    } catch (error: any) {
      if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message ?? String(error))
    }
  }

  const addSource = async () => {
    const url = sourceInput.value.trim()
    if (!url) return
    sourceBusy.value = true
    try {
      await PluginMarket.addSource(url)
      sourceInput.value = ''
    } catch (error: any) {
      ElMessage.error(error?.message ?? String(error))
    } finally {
      sourceBusy.value = false
    }
  }

  const removeSource = async (url: string) => {
    sourceBusy.value = true
    try {
      await PluginMarket.removeSource(url)
    } catch (error: any) {
      ElMessage.error(error?.message ?? String(error))
    } finally {
      sourceBusy.value = false
    }
  }

  const askRestart = () =>
    ElMessageBox.confirm(I18nT('setup.pluginsRestartConfirm'), I18nT('setup.pluginsTitle'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'info'
    })
      .then(() => window.FlyEnvNodeAPI.ipcSendToMain('application:relaunch', 'plugin-relaunch'))
      .catch(() => {})

  onMounted(refresh)
</script>
