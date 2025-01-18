<template>
  <el-popover placement="top" :title="I18nT('base.attention')" width="480px" trigger="hover">
    <template #reference>
      <yb-icon
        :svg="import('@/svg/question.svg?raw')"
        width="12"
        height="12"
        style="margin-left: 5px"
      ></yb-icon>
    </template>
    <template #default>
      <div>
        <pre class="break-words whitespace-pre-wrap" v-html="I18nT('host.sslTips')"></pre>
        <div class="mt-4">
          <el-button size="small" @click.stop="copyCommand">{{
            I18nT('host.copyCommand')
          }}</el-button>
          <el-button size="small" @click.stop="showFile">{{ I18nT('host.showFile') }}</el-button>
        </div>
      </div>
    </template>
  </el-popover>
</template>
<script lang="ts" setup>
  import { I18nT } from '@shared/lang'
  import { MessageSuccess } from '@/util/Element'

  const { shell, clipboard } = require('@electron/remote')
  const { join } = require('path')

  const copyCommand = () => {
    const CARoot = join(global.Server.BaseDir!, 'CA')
    const command = `cd "${CARoot}" && sudo -S security add-trusted-cert -d -r trustRoot -k "/Library/Keychains/System.keychain" "PhpWebStudy-Root-CA.crt"`
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }
  const showFile = () => {
    const CARoot = join(global.Server.BaseDir!, 'CA/PhpWebStudy-Root-CA.crt')
    shell.showItemInFolder(CARoot)
  }
</script>
