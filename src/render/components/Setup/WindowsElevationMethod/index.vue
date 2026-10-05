<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ I18nT('setup.windowsElevationMethod') }}</span>
    <el-tooltip placement="top" :show-after="200">
      <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12" />
      <template #content>
        <span class="block max-w-xs leading-relaxed">{{
          I18nT('setup.windowsElevationMethodTips')
        }}</span>
      </template>
    </el-tooltip>
  </div>
  <!-- reset-pass 会被设置页全局样式强制为横向布局；独立类让说明/操作按行排布。 -->
  <div class="main windows-elevation-settings">
    <div class="method-toolbar">
      <el-radio-group
        :model-value="method"
        :disabled="Controller.busy"
        :aria-label="I18nT('setup.windowsElevationMethod')"
        @change="changeMethod"
      >
        <!-- tooltip 包住选项，悬停或键盘聚焦查看说明；正文只保留两个方式名称。 -->
        <el-tooltip placement="top" :show-after="200">
          <template #content>
            <span class="block max-w-xs leading-relaxed">{{
              I18nT('setup.windowsPrivilege.uacDescription')
            }}</span>
          </template>
          <el-radio-button :label="I18nT('setup.windowsElevationUac')" value="uac" />
        </el-tooltip>
        <el-tooltip placement="top" :show-after="200">
          <template #content>
            <span class="block max-w-xs leading-relaxed">{{
              I18nT('setup.windowsPrivilege.helperDescription')
            }}</span>
          </template>
          <el-radio-button :label="I18nT('setup.windowsElevationHelper')" value="helper" />
        </el-tooltip>
      </el-radio-group>
      <el-button
        v-if="method === 'helper' && !windowServer.WindowsProcessElevated"
        :loading="Controller.busy"
        @click="repair"
        >{{ I18nT('setup.flyenvHelperBtn') }}</el-button
      >
      <!-- 偏好为 UAC 不代表曾安装 Helper；按钮只是维护入口，不显示推断的安装状态。 -->
      <el-tooltip v-if="method === 'uac'" placement="top" :show-after="200">
        <template #content>
          <span class="block max-w-xs leading-relaxed">{{
            I18nT('setup.windowsPrivilege.disableHelperTips')
          }}</span>
        </template>
        <el-button :loading="Controller.busy" @click="disableHelper">{{
          I18nT('setup.windowsPrivilege.disableHelper')
        }}</el-button>
      </el-tooltip>
    </div>
    <!-- 管理员运行直接执行，不能同时显示“首次需要管理员权限时询问”的普通模式提示。 -->
    <p v-if="windowServer.WindowsProcessElevated" class="method-status">{{
      I18nT('setup.windowsPrivilege.elevated')
    }}</p>
    <p v-else-if="!method" class="method-status">{{
      I18nT('setup.windowsPrivilege.unselected')
    }}</p>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@lang/index'
  import { MessageError } from '@/util/Element'
  import Controller from './Controller'
  import { WINDOWS_ELEVATION_CHOICE_VERSION } from '@shared/WindowsHelperState'

  const store = AppStore()
  const windowServer = window.Server
  // 旧默认值不表示用户确认；真实选择前两个选项均不高亮。
  const method = computed(() =>
    store.config.setup.windowsElevationChoiceVersion === WINDOWS_ELEVATION_CHOICE_VERSION
      ? store.config.setup.windowsElevationMethod
      : undefined
  )
  const changeMethod = (value: string | number | boolean) => {
    if (value !== 'uac' && value !== 'helper') return
    // UAC 自动停用和 Helper 准备都由控制器默认策略负责，页面不再持有停用输入。
    void Controller.select(value).catch((error) => MessageError(error.message))
  }
  const repair = () => {
    void Controller.repair().catch((error) => MessageError(error.message))
  }
  const disableHelper = () => {
    void Controller.disableHelper().catch((error) => MessageError(error.message))
  }
</script>

<style lang="scss" scoped>
  // 复用 .main 的面板底色/间距，局部只定义排列；不写死亮色背景或暗色文字。
  .windows-elevation-settings {
    min-width: 0;
    gap: 14px;
    align-items: flex-start;

    .method-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-width: 0;
    }

    // 设置项通常只占页面半宽；长翻译允许换行，不能把相邻设置列撑开。
    .el-radio-group {
      max-width: 100%;
      min-width: 0;
      flex-wrap: wrap;
    }

    :deep(.el-radio-button) {
      max-width: 100%;
      min-width: 0;
    }

    :deep(.el-radio-button__inner) {
      max-width: 100%;
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.5;
    }

    .el-button {
      max-width: 100%;
      height: auto;
      min-height: 32px;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .method-status {
      margin: 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--el-text-color-secondary);
      overflow-wrap: anywhere;
    }
  }
</style>
