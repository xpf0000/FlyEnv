<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> OpenClaw </span>
          <el-tooltip :content="I18nT('openclaw.OpenClawOfficialWebsite')" :show-after="600">
            <el-button link @click.stop="OpenClawSetup.openURL('home')">
              <yb-icon
                style="width: 20px; height: 20px; margin-left: 10px"
                :svg="import('@/svg/http.svg?raw')"
              ></yb-icon>
            </el-button>
          </el-tooltip>
          <template v-if="OpenClawSetup.gatewayRunning && OpenClawSetup.dashboard">
            <el-tooltip :content="I18nT('openclaw.OpenClawLocalDashboard')" :show-after="600">
              <el-button
                style="color: #01cc74"
                class="button"
                link
                @click.stop="OpenClawSetup.openURL('dashboard')"
              >
                <yb-icon
                  style="width: 20px; height: 20px; margin-left: 10px"
                  :svg="import('@/svg/http.svg?raw')"
                ></yb-icon>
              </el-button>
            </el-tooltip>
          </template>
        </div>
        <el-button
          class="button"
          :disabled="OpenClawSetup.loading || OpenClawSetup.installing"
          link
          @click="OpenClawSetup.init()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': OpenClawSetup.loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <template v-if="OpenClawSetup.installing">
        <div class="w-full h-full overflow-hidden p-5">
          <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
        </div>
      </template>
      <template v-else-if="!OpenClawSetup.loading && !OpenClawSetup.installed">
        <div class="p-5">
          <pre class="app-html-block" v-html="I18nT('openclaw.notInstalled')"></pre>
          <el-button
            type="primary"
            class="mt-5"
            :disabled="OpenClawSetup.installing"
            @click.stop="installOpenClaw"
            >{{ I18nT('base.install') }}</el-button
          >
        </div>
      </template>
      <template v-else-if="!OpenClawSetup.loading && !OpenClawSetup.gatewayInstalled">
        <div class="p-5">
          <pre class="app-html-block" v-html="I18nT('openclaw.gatewayNotInstalled')"></pre>
          <el-button type="primary" class="mt-5" @click.stop="OpenClawSetup.installGateway()">{{
            I18nT('base.install')
          }}</el-button>
        </div>
      </template>
      <template v-else-if="OpenClawSetup.installed && OpenClawSetup.gatewayInstalled">
        <div class="p-5">
          <el-form label-position="top" @submit.prevent>
            <el-form-item :label="I18nT('openclaw.gatewayStatus')">
              <template v-if="OpenClawSetup.gatewayRunning">
                <span class="text-[#01cc74]">{{ I18nT('openclaw.gatewayRunning') }}</span>
              </template>
              <template v-else>
                <span>{{ I18nT('openclaw.gatewayStopped') }}</span>
              </template>
            </el-form-item>
            <el-form-item>
              <template v-if="OpenClawSetup.loading">
                <el-button link loading disabled></el-button>
              </template>
              <template v-else-if="OpenClawSetup.gatewayRunning">
                <el-button
                  link
                  :disabled="OpenClawSetup.loading"
                  @click.stop="OpenClawSetup.stopGateway()"
                >
                  <yb-icon
                    class="w-[20px] h-[20px] text-[#cc5441]"
                    :svg="import('@/svg/stop2.svg?raw')"
                  />
                </el-button>
              </template>
              <template v-else>
                <el-button
                  link
                  :disabled="OpenClawSetup.loading"
                  @click.stop="OpenClawSetup.startGateway()"
                >
                  <yb-icon
                    class="w-[20px] h-[20px] hover:text-yellow-500"
                    :svg="import('@/svg/play.svg?raw')"
                  />
                </el-button>
              </template>
            </el-form-item>
            <el-form-item :label="I18nT('host.action')">
              <div class="w-full flex flex-wrap gap-5">
                <template v-for="(item, _index) in OpenClawSetup.actions" :key="_index">
                  <el-button
                    style="margin-left: 0"
                    class="flex-shrink-0"
                    @click.stop="doAction(item)"
                    >{{ item }}</el-button
                  >
                </template>
              </div>
            </el-form-item>
          </el-form>
        </div>
      </template>
      <template v-else-if="OpenClawSetup.loading">
        <div v-loading class="w-full h-full"></div>
      </template>
    </div>
    <template v-if="OpenClawSetup.installing" #footer>
      <template v-if="OpenClawSetup.installEnd">
        <el-button type="primary" @click.stop="OpenClawSetup.taskConfirm()">{{
          I18nT('base.confirm')
        }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="OpenClawSetup.taskCancel()">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { OpenClawSetup } from './setup'
  import { nextTick, onMounted, onUnmounted } from 'vue'
  import XTerm from '@/util/XTerm'

  const xtermDom = ref()

  const installOpenClaw = () => {
    OpenClawSetup.installOpenClaw(xtermDom)
  }

  const doAction = (action: string) => {
    OpenClawSetup.doAction(action, xtermDom)
  }

  onMounted(() => {
    if (OpenClawSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = OpenClawSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    OpenClawSetup?.xterm?.unmounted?.()
  })
</script>
<style lang="scss" scoped>
  .service-table {
    :deep(.el-table__expanded-cell) {
      padding-top: 0 !important;
    }
  }
</style>
