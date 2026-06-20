<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>Claude Code CLI</span>
          <el-dropdown>
            <el-button link style="margin-left: 10px">
              <yb-icon
                style="width: 20px; height: 20px"
                :svg="import('@/svg/http.svg?raw')"
              ></yb-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-item @click.stop="ClaudeCodeSetup.openURL('home')">
                {{ I18nT('claudeCode.officialWebsite') }}
              </el-dropdown-item>
              <el-dropdown-item @click.stop="ClaudeCodeSetup.openURL('docs')">
                {{ I18nT('claudeCode.officialDocs') }}
              </el-dropdown-item>
            </template>
          </el-dropdown>
        </div>
        <el-button
          class="button"
          :disabled="ClaudeCodeSetup.loading || ClaudeCodeSetup.installing"
          link
          @click="ClaudeCodeSetup.init()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': ClaudeCodeSetup.loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <template v-if="ClaudeCodeSetup.installing">
        <div class="w-full h-full overflow-hidden p-5">
          <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
        </div>
      </template>
      <template v-else-if="!ClaudeCodeSetup.loading && !ClaudeCodeSetup.installed">
        <div class="p-5">
          <pre class="app-html-block" v-html="I18nT('claudeCode.notInstalled')"></pre>
          <div class="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {{ installCommand }}
          </div>
          <el-button
            type="primary"
            class="mt-5"
            :disabled="ClaudeCodeSetup.installing"
            @click.stop="installClaudeCode"
            >{{ I18nT('base.install') }}</el-button
          >
        </div>
      </template>
      <template v-else-if="ClaudeCodeSetup.installed">
        <div class="p-5 h-full overflow-hidden">
          <el-form
            class="h-full overflow-hidden flex flex-col"
            label-position="top"
            @submit.prevent
          >
            <el-form-item class="flex-shrink-0" :label="'Claude Code ' + I18nT('base.version')">
              <span
                class="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300 leading-relaxed"
                >{{ ClaudeCodeSetup.version }}</span
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
                      v-for="(category, cIndex) in ClaudeCodeSetup.commandData.categories"
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
      <template v-else-if="ClaudeCodeSetup.loading">
        <div v-loading class="w-full h-full"></div>
      </template>
    </div>
    <template v-if="ClaudeCodeSetup.installing" #footer>
      <template v-if="ClaudeCodeSetup.installEnd">
        <el-button type="primary" @click.stop="ClaudeCodeSetup.taskConfirm()">{{
          I18nT('base.confirm')
        }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="ClaudeCodeSetup.taskCancel()">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { CommandItem, ClaudeCodeSetup } from './setup'
  import { nextTick, onMounted, onUnmounted } from 'vue'
  import XTerm from '@/util/XTerm'

  const xtermDom = ref()
  const activeCategories = ref(['claudeCode.category.basic'])

  const installCommand = computed(() => {
    if (window.Server.isWindows) {
      return 'irm https://claude.ai/install.ps1 | iex'
    }
    return 'curl -fsSL https://claude.ai/install.sh | bash'
  })

  const installClaudeCode = () => {
    ClaudeCodeSetup.installClaudeCode(xtermDom)
  }

  const doAction = (item: CommandItem) => {
    ClaudeCodeSetup.doAction(item)
  }

  onMounted(() => {
    if (ClaudeCodeSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = ClaudeCodeSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    ClaudeCodeSetup?.xterm?.unmounted?.()
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
