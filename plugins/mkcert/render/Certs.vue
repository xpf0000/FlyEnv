<template>
  <el-card class="app-base-el-card">
    <template #header>
      <div class="w-full justify-between items-center flex overflow-hidden gap-4 h-[30px]">
        <div class="flex-shrink-0 items-center flex gap-2">
          <span>mkcert</span>
          <el-select v-model="bin" size="small" class="w-52">
            <template v-for="(item, _index) in versions" :key="_index">
              <el-option :label="item.bin" :value="item.bin"></el-option>
            </template>
          </el-select>
        </div>
        <div class="flex-1 items-center flex gap-2 justify-end overflow-hidden">
          <span class="font-bold truncate flex-shrink-0">{{ MkcertT('carootLabel') }}:</span>
          <span
            v-if="MkCertStore.caroot"
            class="truncate hover:text-yellow-500 cursor-pointer"
            @click.stop="shell.openPath(MkCertStore.caroot)"
            >{{ MkCertStore.caroot }}</span
          >
          <el-button
            :loading="MkCertStore.installing"
            :disabled="!currentVersion"
            type="primary"
            size="small"
            @click="doInstallCA"
          >
            {{ MkcertT('installCA') }}
          </el-button>
        </div>
      </div>
    </template>
    <template #default>
      <template v-if="MkCertStore.installing">
        <div class="w-full h-full overflow-hidden p-5">
          <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
        </div>
      </template>
      <template v-else-if="currentVersion">
        <el-scrollbar>
          <el-empty v-if="sslHosts.length === 0" :description="MkcertT('noSSLHosts')" />
          <template v-else>
            <div class="flex items-center gap-3 px-4 pt-4">
              <el-button size="small" @click.stop="toggleAll">
                {{ allSelected ? MkcertT('clearSelection') : MkcertT('selectAll') }}
              </el-button>
              <span class="text-xs text-gray-500">
                {{ MkcertT('selectedCount', { count: selectedIds.size }) }}
              </span>
              <el-button
                class="ml-auto"
                type="primary"
                size="small"
                :disabled="selectedIds.size === 0"
                @click.stop="doGenerateSelected"
              >
                {{ MkcertT('generateSelected') }}
              </el-button>
            </div>
            <div
              v-for="host in sslHosts"
              :key="host.name"
              class="mb-6 border rounded-lg p-4 dark:border-gray-600"
            >
              <div class="flex items-center justify-between mb-3">
                <el-checkbox
                  :model-value="selectedIds.has(host.id)"
                  @update:model-value="() => toggleOne(host)"
                >
                  <span class="font-semibold text-base">{{ host.name }}</span>
                </el-checkbox>
                <el-button type="primary" size="small" @click.stop="doGenerate(host)">
                  {{ I18nT('common.action.generate') }}
                </el-button>
              </div>

              <!-- Cert/Key paths -->
              <div class="text-xs text-gray-500 space-y-1 mb-3">
                <div class="flex items-center">
                  <div class="font-bold w-[40px]">cert: </div>
                  <span
                    class="font-mono truncate cursor-pointer hover:text-yellow-500"
                    @click.stop="shell.showItemInFolder(host.ssl?.cert)"
                    >{{ host.ssl?.cert || certDefault(host) }}</span
                  >
                </div>
                <div class="flex items-center">
                  <div class="font-bold w-[40px]">key: </div>
                  <span
                    class="font-mono truncate cursor-pointer hover:text-yellow-500"
                    @click.stop="shell.showItemInFolder(host.ssl?.key)"
                    >{{ host.ssl?.key || keyDefault(host) }}</span
                  >
                </div>
              </div>
            </div>
          </template>
        </el-scrollbar>
      </template>
    </template>
    <template v-if="MkCertStore.installing" #footer>
      <template v-if="MkCertStore.installEnd">
        <template v-if="MkCertStore.bulkResults.length">
          <div class="w-full flex items-center gap-2 flex-wrap">
            <span class="font-bold">{{ MkcertT('bulkResults') }}:</span>
            <el-tag
              v-for="item in MkCertStore.bulkResults"
              :key="item.hostId"
              :type="item.ok ? 'success' : 'danger'"
              size="small"
              >{{ item.hostName }}</el-tag
            >
            <el-button class="ml-auto" type="primary" @click.stop="MkCertStore.taskConfirm()">
              {{ I18nT('base.confirm') }}
            </el-button>
          </div>
        </template>
        <el-button v-else type="primary" @click.stop="MkCertStore.taskConfirm()">{{
          I18nT('base.confirm')
        }}</el-button>
      </template>
      <template v-else>
        <span v-if="MkCertStore.bulkTotal" class="mr-3 text-sm">
          {{
            MkcertT('bulkGenerating', {
              done: MkCertStore.bulkDone,
              total: MkCertStore.bulkTotal
            })
          }}
        </span>
        <el-button @click.stop="MkCertStore.taskCancel()">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import { AppStore } from '@/store/app'
  import type { AppHost } from '@/store/app'
  import MkCertStore from './MkCertStore'
  import { I18nT } from '@lang/index'
  import { MkcertT } from './lang'
  import type { SoftInstalled } from '@shared/app'
  import { BrewStore } from '@/store/brew'
  import { shell } from '@/util/NodeFn'
  import { join } from '@/util/path-browserify'

  const bin = ref('')

  const xtermDom = ref<HTMLElement>()

  const appStore = AppStore()
  const brewStore = BrewStore()

  const versions = computed(() => {
    return brewStore.module('mkcert').installed
  })

  const currentVersion = computed(() => {
    const list = versions.value
    if (!list.length) {
      return null
    }
    const cur = appStore.config.server?.mkcert?.current?.version
    let find: SoftInstalled | undefined
    if (cur) {
      find = list.find((v) => v.version === cur)
    }
    return find ?? list[0]
  })

  watch(
    currentVersion,
    (v: SoftInstalled | null) => {
      if (v) {
        MkCertStore.fetchCARoot(v)
        bin.value = v.bin
      }
    },
    {
      immediate: true
    }
  )

  const doInstallCA = () => {
    MkCertStore.installCA(xtermDom as any, currentVersion.value?.bin ?? '')
  }

  const sslHosts = computed(() => {
    return appStore.hosts as AppHost[]
  })

  const selectedIds = ref(new Set<number>())

  const allSelected = computed(
    () => sslHosts.value.length > 0 && selectedIds.value.size === sslHosts.value.length
  )

  const toggleOne = (host: AppHost) => {
    const set = selectedIds.value
    if (set.has(host.id)) {
      set.delete(host.id)
    } else {
      set.add(host.id)
    }
  }

  const toggleAll = () => {
    if (allSelected.value) {
      selectedIds.value.clear()
    } else {
      sslHosts.value.forEach((h) => selectedIds.value.add(h.id))
    }
  }

  const certDefault = (host: AppHost) => {
    return join(window.Server.BaseDir!, 'CA', `${host.id}`, `CA-${host.id}.crt`)
  }

  const keyDefault = (host: AppHost) => {
    return join(window.Server.BaseDir!, 'CA', `${host.id}`, `CA-${host.id}.key`)
  }

  const doGenerate = (host: AppHost) => {
    MkCertStore.generateCert(host, xtermDom as any, currentVersion.value?.bin ?? '')
  }

  const doGenerateSelected = () => {
    const hosts = sslHosts.value.filter((h) => selectedIds.value.has(h.id))
    if (!hosts.length) {
      return
    }
    MkCertStore.generateCertsBulk(hosts, xtermDom as any, currentVersion.value?.bin ?? '')
  }

  onMounted(() => {
    brewStore.module('mkcert').fetchInstalled()
    MkCertStore.onMounted(xtermDom)
  })

  onUnmounted(() => {
    MkCertStore.onUnmounted()
  })
</script>
