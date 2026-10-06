<template>
  <el-dialog
    v-model="show"
    :title="I18nT('setup.windowsPrivilege.title')"
    class="windows-privilege-choice"
    width="min(640px, calc(100vw - 32px))"
    top="10vh"
    :close-on-click-modal="false"
    @closed="closed"
  >
    <!-- 仅正文滚动，标题和授权/取消按钮保持可见；长操作列表不会改变弹窗高度。 -->
    <el-scrollbar height="100%" class="choice-scrollbar">
      <div class="choice-content">
        <!-- 原因是说明区：使用侧线和文字层级，与下面两个授权方式卡片区分。 -->
        <section class="choice-reason">
          <p>{{ I18nT('setup.windowsPrivilege.description', { operation: operationName }) }}</p>
          <!-- 只展示执行层提供的目标快照；长路径可换行，不展示文件内容或内部脚本。 -->
          <template v-if="reason?.items.length">
            <h3 class="choice-reason-title mt-3">
              {{ I18nT('setup.windowsPrivilege.detailsTitle') }}
            </h3>
            <ul>
              <li v-for="(item, index) in reason.items" :key="index">
                <span>{{ I18nT(`setup.windowsPrivilege.operations.${item.kind}`) }}</span>
                <code v-if="item.target" dir="ltr">{{ item.target }}</code>
              </li>
            </ul>
            <p v-if="reason.omitted" class="choice-hint mt-2">
              {{ I18nT('setup.windowsPrivilege.detailsMore', { count: reason.omitted }) }}
            </p>
          </template>
        </section>
        <div class="choice-method mt-4">
          <b>{{ I18nT('setup.windowsElevationUac') }}</b>
          <p class="mt-2">{{ I18nT('setup.windowsPrivilege.uacDescription') }}</p>
        </div>
        <div class="choice-method mt-3">
          <b>{{ I18nT('setup.windowsElevationHelper') }}</b>
          <p class="mt-2">{{ I18nT('setup.windowsPrivilege.helperDescription') }}</p>
        </div>
        <p class="choice-hint mt-3 text-sm">{{ I18nT('setup.windowsPrivilege.settingsHint') }}</p>
      </div>
    </el-scrollbar>
    <template #footer>
      <div class="choice-footer">
        <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button @click="callback({ method: 'helper' })">{{
          I18nT('setup.windowsPrivilege.useHelper')
        }}</el-button>
        <el-button @click="callback({ method: 'uac' })">{{
          I18nT('setup.windowsPrivilege.useUac')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, watch, onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import Controller from './Controller'
  import {
    sanitizeWindowsPrivilegeReason,
    type WindowsPrivilegeReason
  } from '@shared/WindowsPrivilegeReason'

  const props = defineProps<{ operation: string; reason?: WindowsPrivilegeReason }>()
  // 旧请求没有 reason 时继续显示操作名称；新原因再次校验，仅以 Vue 文本插值呈现。
  const reason = computed(() => sanitizeWindowsPrivilegeReason(props.reason))
  // 弹窗只提交授权方式；选择 UAC 的停用策略统一由控制器负责，没有额外勾选状态。
  const { show, callback, closedFn, onClosed, onSubmit } = AsyncComponentSetup()
  // 不设置自动关闭计时；仅在 main 明确结束选择或控制器替换请求时同步卸载。
  // 仍需结束 AsyncComponentShow，避免已隐藏的弹窗继续占用控制器 choiceId。
  const closeEndedChoice = () => {
    if (!Controller.choiceActive) {
      show.value = false
      callback(undefined)
    }
  }
  watch(() => Controller.choiceActive, closeEndedChoice)
  onMounted(closeEndedChoice)
  // 只把受支持动作映射为产品说明，未知操作显示通用名称，避免暴露内部命令文本。
  const operations = new Set([
    'writeFileByRoot',
    'writeBufferBase64ByRoot',
    'readFileByRoot',
    'rm',
    'installFlyEnvPowerShellIntegration',
    'ensureFlyEnvDataDirectory',
    'setSystemPath',
    'setSystemEnv',
    'setAutoStartWin',
    'sslAddTrustedCert',
    'kill',
    'killPorts',
    'dnsRefresh',
    'getSystemPath',
    'getPortPids',
    'processListWin',
    'sslFindCertificate',
    'ready'
  ])
  const operationName = computed(() => {
    const name = props.operation.split('/').pop() ?? ''
    return I18nT(
      operations.has(name)
        ? `setup.windowsPrivilege.operations.${name}`
        : 'setup.windowsPrivilege.operation'
    )
  })
  // 用户关闭按钮/ESC 或 main 结束选择后统一卸载；已提交的 Promise 忽略第二次结果。
  const closed = () => {
    callback(undefined)
    closedFn()
  }
  defineExpose({ show, onClosed, onSubmit })
</script>

<style lang="scss">
  // Dialog 使用 teleport；专用类限定样式范围，使正文与底部按钮都可换行。
  // 80vh 的固定高度配合 flex 正文与 el-scrollbar，短窗口仍保留标题/按钮。
  // 长文本先换行，再限制横向滚动；不能仅裁掉说明文字来掩盖宽度问题。
  .el-dialog.windows-privilege-choice {
    box-sizing: border-box;
    max-width: calc(100vw - 32px);
    height: 80vh;
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--el-bg-color-overlay);
    color: var(--el-text-color-primary);
    overflow-wrap: anywhere;

    .el-dialog__header,
    .el-dialog__footer {
      flex-shrink: 0;
      min-width: 0;
    }

    .el-dialog__body {
      flex: 1;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
      color: inherit;
      line-height: 1.6;
    }

    // 滚动高度由剩余正文空间决定；横向文本宽度不得撑开 scrollbar 的 view。
    .choice-scrollbar {
      min-height: 0;
      min-width: 0;
    }

    .choice-scrollbar .el-scrollbar__wrap {
      overflow-x: hidden;
    }

    .choice-content {
      min-width: 0;
      padding-inline-end: 10px;
    }

    .choice-method {
      min-width: 0;
      border: 1px solid var(--el-border-color-light);
      border-radius: 8px;
      padding: 16px;
      background: var(--main-panel-bg-color);
    }

    // 操作说明没有卡片底色、圆角或四边框，避免看起来像第三种授权方式。
    .choice-reason {
      min-width: 0;
      border-inline-start: 2px solid var(--el-border-color-light);
      padding: 4px 0;
      padding-inline-start: 12px;
    }

    .choice-reason-title {
      font-size: 12px;
      font-weight: 500;
      color: var(--el-text-color-secondary);
    }

    .choice-reason ul {
      margin-top: 8px;
      padding: 0;
      list-style: none;
    }

    .choice-reason li + li {
      margin-top: 10px;
    }

    .choice-reason code {
      display: block;
      max-width: 100%;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      user-select: text;
      font-size: 12px;
    }

    .choice-hint {
      color: var(--el-text-color-secondary);
    }

    .choice-footer {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }

    .choice-footer .el-button {
      max-width: 100%;
      min-height: 32px;
      height: auto;
      margin-left: 0;
      white-space: normal;
    }
  }

  // 与现有 host-edit 弹窗共用暗色底色和面板变量，不沿用 Element Plus 默认黑灰色。
  html.dark .el-dialog.windows-privilege-choice {
    --el-dialog-bg-color: var(--base-bg-color);
    --el-text-color-primary: var(--base-color-white-07);
    --el-text-color-regular: var(--base-color-white-07);
    background: var(--base-bg-color);
    color: var(--base-color-white-07);

    .choice-method {
      border-color: rgba(255, 255, 255, 0.12);
      background: var(--base-bg-color-1);
    }

    .choice-reason {
      border-inline-start-color: rgba(255, 255, 255, 0.12);
    }

    .choice-hint,
    .choice-reason-title {
      color: var(--base-color-white-07);
    }
  }
</style>
