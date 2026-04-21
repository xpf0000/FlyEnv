<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>Hermes-Agent</span>
          <el-tooltip :content="I18nT('hermes.HermesOfficialWebsite')" :show-after="600">
            <el-button link @click.stop="HermesSetup.openURL('home')">
              <yb-icon
                style="width: 20px; height: 20px; margin-left: 10px"
                :svg="import('@/svg/http.svg?raw')"
              ></yb-icon>
            </el-button>
          </el-tooltip>
        </div>
        <el-button
          class="button"
          :disabled="HermesSetup.loading || HermesSetup.installing"
          link
          @click="HermesSetup.init()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': HermesSetup.loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <template v-if="HermesSetup.installing">
        <div class="w-full h-full overflow-hidden p-5">
          <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
        </div>
      </template>
      <template v-else-if="!HermesSetup.loading && !HermesSetup.installed">
        <div class="p-5">
          <pre class="app-html-block" v-html="I18nT('hermes.notInstalled')"></pre>
          <el-button
            type="primary"
            class="mt-5"
            :disabled="HermesSetup.installing"
            @click.stop="installHermes"
            >{{ I18nT('base.install') }}</el-button
          >
        </div>
      </template>
      <template v-else-if="HermesSetup.installed">
        <div class="p-5 h-full overflow-hidden">
          <el-form
            class="h-full overflow-hidden flex flex-col"
            label-position="top"
            @submit.prevent
          >
            <el-form-item class="flex-shrink-0" :label="'Hermes ' + I18nT('base.version')">
              <span
                class="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300 leading-relaxed"
                >{{ HermesSetup.version }}</span
              >
            </el-form-item>
            <el-form-item class="flex-shrink-0" :label="I18nT('hermes.gatewayStatus')">
              <template v-if="HermesSetup.gatewayRunning">
                <span class="text-[#01cc74]">{{ I18nT('hermes.gatewayRunning') }}</span>
              </template>
              <template v-else>
                <span>{{ I18nT('hermes.gatewayStopped') }}</span>
              </template>
            </el-form-item>
            <el-form-item class="flex-shrink-0">
              <template v-if="HermesSetup.loading">
                <el-button link loading disabled></el-button>
              </template>
              <template v-else-if="HermesSetup.gatewayRunning">
                <el-button
                  link
                  :disabled="HermesSetup.loading"
                  @click.stop="HermesSetup.stopGateway()"
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
                  :disabled="HermesSetup.loading"
                  @click.stop="HermesSetup.startGateway()"
                >
                  <yb-icon
                    class="w-[20px] h-[20px] hover:text-yellow-500"
                    :svg="import('@/svg/play.svg?raw')"
                  />
                </el-button>
              </template>
            </el-form-item>
            <el-form-item
              class="flex-1 overflow-hidden el-form-item-flex-1 flex flex-col w-full"
              :label="I18nT('host.action')"
            >
              <el-scrollbar class="w-full">
                <div class="w-full command-categories">
                  <el-collapse v-model="activeCategories">
                    <el-collapse-item
                      v-for="(category, cIndex) in HermesSetup.commandData.categories"
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
      <template v-else-if="HermesSetup.loading">
        <div v-loading class="w-full h-full"></div>
      </template>
    </div>
    <template v-if="HermesSetup.installing" #footer>
      <template v-if="HermesSetup.installEnd">
        <el-button type="primary" @click.stop="HermesSetup.taskConfirm()">{{
          I18nT('base.confirm')
        }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="HermesSetup.taskCancel()">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { CommandItem, HermesSetup } from './setup'
  import { nextTick, onMounted, onUnmounted } from 'vue'
  import XTerm from '@/util/XTerm'

  const xtermDom = ref()
  const activeCategories = ref(['hermes.category.basicInfo'])

  const installHermes = () => {
    HermesSetup.installHermes(xtermDom)
  }

  const doAction = (item: CommandItem) => {
    HermesSetup.doAction(item, xtermDom)
  }

  onMounted(() => {
    if (HermesSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = HermesSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    HermesSetup?.xterm?.unmounted?.()
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
