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
          <span class="font-bold truncate flex-shrink-0">{{ I18nT('mkcert.carootLabel') }}:</span>
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
            {{ I18nT('mkcert.installCA') }}
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
          <!-- No SSL hosts -->
          <el-empty v-if="sslHosts.length === 0" :description="I18nT('mkcert.noSSLHosts')" />

          <!-- SSL hosts list -->
          <template v-else>
            <div
              v-for="host in sslHosts"
              :key="host.name"
              class="mb-6 border rounded-lg p-4 dark:border-gray-600"
            >
              <div class="flex items-center justify-between mb-3">
                <span class="font-semibold text-base">{{ host.name }}</span>
                <el-button type="primary" size="small" @click="doGenerate(host)">
                  {{ I18nT('mkcert.generate') }}
                </el-button>
              </div>

              <!-- Cert/Key paths -->
              <div class="text-xs text-gray-500 space-y-1 mb-3">
                <div class="flex items-center">
                  <div class="font-bold w-[40px]">cert: </div>
                  <span
                    class="font-mono truncate cursor-pointer hover:text-yellow-500"
                    @click.stop="shell.showItemInFolder(host.ssl?.cert)"
                    >{{ host.ssl?.cert || '-' }}</span
                  >
                </div>
                <div class="flex items-center">
                  <div class="font-bold w-[40px]">key: </div>
                  <span
                    class="font-mono truncate cursor-pointer hover:text-yellow-500"
                    @click.stop="shell.showItemInFolder(host.ssl?.key)"
                    >{{ host.ssl?.key || '-' }}</span
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
        <el-button type="primary" @click.stop="MkCertStore.taskConfirm()">{{
          I18nT('base.confirm')
        }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="MkCertStore.taskCancel()">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { AppStore } from '@/store/app'
  import type { AppHost } from '@/store/app'
  import MkCertStore from '@/components/MkCert/MkCertStore'
  import { I18nT } from '@lang/index'
  import type { SoftInstalled } from '@shared/app'
  import { BrewStore } from '@/store/brew'
  import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
  import { shell } from '@/util/NodeFn'

  ServiceActionStore.fetchPath()

  const bin = ref('')

  const xtermDom = ref<HTMLElement>()

  const appStore = AppStore()
  const brewStore = BrewStore()

  const versions = computed(() => {
    return brewStore.module('mkcert').installed
  })

  const currentVersion = computed(() => {
    if (!versions.value.length) {
      return null
    }
    let find: any
    if (ServiceActionStore.appPath.length) {
      find = versions.value.find((v) => ServiceActionStore.isInAppEnv(v))
      if (find) {
        return find
      }
    }
    if (ServiceActionStore.allPath.length) {
      find = versions.value.find((v) => ServiceActionStore.isInEnv(v))
      if (find) {
        return find
      }
    }
    return versions.value[0]
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
    MkCertStore.installCA(xtermDom as any, currentVersion.value.bin)
  }

  const sslHosts = computed(() => {
    return (appStore.hosts as AppHost[]).filter((h) => h.useSSL)
  })

  const doGenerate = (host: AppHost) => {
    if (!host.ssl?.cert || !host.ssl?.key) return
    MkCertStore.generateCert(host, xtermDom as any, currentVersion.value.bin)
  }
</script>
