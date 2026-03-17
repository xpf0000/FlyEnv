<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>n8n</span>
          <el-button
            class="button"
            link
            @click="openURL('https://docs.n8n.io/hosting/installation/npm/')"
          >
            <yb-icon
              style="width: 20px; height: 20px; margin-left: 10px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
        </div>
        <el-button
          class="button"
          :disabled="setup.installing || setup.fetching"
          link
          @click="setup.reinit()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': setup.fetching }"
          ></yb-icon>
        </el-button>
      </div>
    </template>

    <!-- xterm terminal shown while installing -->
    <template v-if="setup.installing">
      <div class="w-full h-full overflow-hidden p-2">
        <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
      </div>
    </template>

    <!-- version table -->
    <template v-else>
      <el-table
        show-overflow-tooltip
        height="100%"
        :data="setup.versions"
        :border="false"
        style="width: 100%"
      >
        <template #empty>
          <template v-if="setup.fetching">{{ I18nT('base.gettingVersion') }}</template>
          <template v-else>{{ I18nT('util.noVerionsFoundInLib') }}</template>
        </template>
        <el-table-column prop="version" :label="I18nT('base.version')">
          <template #default="scope">
            <span class="pl-6">{{ scope.row.version }}</span>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('base.isInstalled')" width="150">
          <template #default="scope">
            <div class="cell-status">
              <yb-icon
                v-if="scope.row.installed"
                :svg="import('@/svg/ok.svg?raw')"
                class="installed"
              ></yb-icon>
            </div>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('base.action')" width="150">
          <template #default="scope">
            <el-button
              type="primary"
              link
              :disabled="setup.installing"
              @click.stop="handleAction(scope.row)"
            >
              {{ scope.row.installed ? I18nT('base.uninstall') : I18nT('base.install') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template v-if="setup.installing" #footer>
      <template v-if="setup.installEnd">
        <el-button type="primary" @click.stop="setup.onConfirm()">{{
          I18nT('base.confirm')
        }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="setup.onCancel()">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, onMounted, onUnmounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { shell } from '@/util/NodeFn'
  import { N8NManagerSetup } from './setup'

  const xtermDom = ref<HTMLElement>()
  const setup = N8NManagerSetup

  const openURL = (url: string) => {
    shell.openExternal(url).catch()
  }

  const handleAction = (row: any) => {
    setup.doAction(row.version, row.installed, xtermDom as any)
  }

  onMounted(() => {
    setup.init()
    setup.onMounted(xtermDom)
  })

  onUnmounted(() => {
    setup.onUnmounted()
  })
</script>
