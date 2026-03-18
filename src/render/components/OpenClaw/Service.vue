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
          <el-button type="primary" class="mt-5" @click.stop="installOpenClawGateway">{{
            I18nT('base.install')
          }}</el-button>
        </div>
      </template>
      <template v-else-if="OpenClawSetup.installed && OpenClawSetup.gatewayInstalled">
        <div class="p-5 openclaw-service-content h-full overflow-hidden">
          <el-form
            class="h-full overflow-hidden flex flex-col"
            label-position="top"
            @submit.prevent
          >
            <el-form-item class="flex-shrink-0" :label="'OpenClaw ' + I18nT('base.version')">
              <span>{{ OpenClawSetup.version }}</span>
            </el-form-item>
            <el-form-item class="flex-shrink-0" :label="I18nT('openclaw.gatewayStatus')">
              <template v-if="OpenClawSetup.gatewayRunning">
                <span class="text-[#01cc74]">{{ I18nT('openclaw.gatewayRunning') }}</span>
              </template>
              <template v-else>
                <span>{{ I18nT('openclaw.gatewayStopped') }}</span>
              </template>
            </el-form-item>
            <el-form-item class="flex-shrink-0">
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
            <el-form-item
              class="flex-1 overflow-hidden el-form-item-flex-1 flex flex-col"
              :label="I18nT('host.action')"
            >
              <el-scrollbar>
                <div class="w-full command-categories">
                  <el-collapse v-model="activeCategories">
                    <el-collapse-item
                      v-for="(category, cIndex) in OpenClawSetup.commandData.categories"
                      :key="cIndex"
                      :title="I18nT(category.nameKey)"
                      :name="category.nameKey"
                    >
                      <div class="command-buttons">
                        <el-tooltip
                          v-for="(item, index) in category.commands"
                          :key="index"
                          :content="I18nT(item.descriptionKey)"
                          placement="top"
                          :show-after="500"
                        >
                          <el-button class="command-btn" @click.stop="doAction(item)">
                            {{ item.label }}
                          </el-button>
                        </el-tooltip>
                      </div>
                    </el-collapse-item>
                  </el-collapse>
                </div>
              </el-scrollbar>
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
  import { CommandItem, OpenClawSetup } from "./setup";
  import { nextTick, onMounted, onUnmounted } from 'vue'
  import XTerm from '@/util/XTerm'

  const xtermDom = ref()
  const activeCategories = ref(['openclaw.category.basicInfo'])

  const installOpenClaw = () => {
    OpenClawSetup.installOpenClaw(xtermDom)
  }

  const installOpenClawGateway = () => {
    OpenClawSetup.installGateway(xtermDom)
  }

  const doAction = (item: CommandItem) => {
    OpenClawSetup.doAction(item, xtermDom)
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

  .command-categories {
    :deep(.el-collapse) {
      border: none;
    }

    :deep(.el-collapse-item__header) {
      font-weight: 500;
      font-size: 14px;
    }

    :deep(.el-collapse-item__content) {
      padding-bottom: 10px;
    }
  }

  .command-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .command-btn {
      margin-left: 0;
      flex-shrink: 0;
      font-size: 12px;
      padding: 6px 12px;
    }
  }
</style>
