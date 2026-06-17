<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>Kimi Code CLI</span>
          <el-tooltip :content="I18nT('kimi.officialWebsite')" :show-after="600">
            <el-button link @click.stop="KimiSetup.openURL('home')">
              <yb-icon
                style="width: 20px; height: 20px; margin-left: 10px"
                :svg="import('@/svg/http.svg?raw')"
              ></yb-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="I18nT('kimi.officialDocs')" :show-after="600">
            <el-button link @click.stop="KimiSetup.openURL('docs')">
              <yb-icon
                style="width: 20px; height: 20px; margin-left: 4px"
                :svg="import('@/svg/http.svg?raw')"
              ></yb-icon>
            </el-button>
          </el-tooltip>
        </div>
        <el-button
          class="button"
          :disabled="KimiSetup.loading || KimiSetup.installing"
          link
          @click="KimiSetup.init()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': KimiSetup.loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <template v-if="KimiSetup.installing">
        <div class="w-full h-full overflow-hidden p-5">
          <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
        </div>
      </template>
      <template v-else-if="!KimiSetup.loading && !KimiSetup.installed">
        <div class="p-5">
          <pre class="app-html-block" v-html="I18nT('kimi.notInstalled')"></pre>
          <div class="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {{ installCommand }}
          </div>
          <el-button
            type="primary"
            class="mt-5"
            :disabled="KimiSetup.installing"
            @click.stop="installKimi"
            >{{ I18nT('base.install') }}</el-button
          >
        </div>
      </template>
      <template v-else-if="KimiSetup.installed">
        <div class="p-5 h-full overflow-hidden">
          <el-form
            class="h-full overflow-hidden flex flex-col"
            label-position="top"
            @submit.prevent
          >
            <el-form-item class="flex-shrink-0" :label="'Kimi ' + I18nT('base.version')">
              <span
                class="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300 leading-relaxed"
                >{{ KimiSetup.version }}</span
              >
            </el-form-item>
            <el-form-item
              class="flex-1 overflow-hidden el-form-item-flex-1 flex flex-col w-full"
              :label="I18nT('host.action')"
            >
              <el-scrollbar class="w-full">
                <div class="w-full command-categories">
                  <el-collapse v-model="activeCategories">
                    <el-collapse-item
                      v-for="(category, cIndex) in KimiSetup.commandData.categories"
                      :key="cIndex"
                      :title="I18nT(category.nameKey as any)"
                      :name="category.nameKey"
                    >
                      <div class="command-buttons">
                        <el-tooltip
                          v-for="(item, index) in category.commands"
                          :key="index"
                          :content="I18nT(item.descriptionKey as any)"
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
      <template v-else-if="KimiSetup.loading">
        <div v-loading class="w-full h-full"></div>
      </template>
    </div>
    <template v-if="KimiSetup.installing" #footer>
      <template v-if="KimiSetup.installEnd">
        <el-button type="primary" @click.stop="KimiSetup.taskConfirm()">{{
          I18nT('base.confirm')
        }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="KimiSetup.taskCancel()">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { CommandItem, KimiSetup } from './setup'
  import { nextTick, onMounted, onUnmounted } from 'vue'
  import XTerm from '@/util/XTerm'

  const xtermDom = ref()
  const activeCategories = ref(['kimi.category.basic'])

  const installCommand = computed(() => {
    if (window.Server.isWindows) {
      return 'irm https://code.kimi.com/kimi-code/install.ps1 | iex'
    }
    return 'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash'
  })

  const installKimi = () => {
    KimiSetup.installKimi(xtermDom)
  }

  const doAction = (item: CommandItem) => {
    KimiSetup.doAction(item, xtermDom)
  }

  onMounted(() => {
    if (KimiSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = KimiSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    KimiSetup?.xterm?.unmounted?.()
  })
</script>
<style lang="scss" scoped>
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
