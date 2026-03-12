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
  import { I18nT } from '@lang/index'
  import { MessageSuccess } from '@/util/Element'
  import { join } from '@/util/path-browserify'
  import { shell, clipboard } from '@/util/NodeFn'

  const copyCommand = () => {
    const CARoot = join(window.Server.BaseDir!, 'CA')
    const CARootFile = join(window.Server.BaseDir!, 'CA/FlyEnv-Root-CA.crt')
    let command = ''
    if (window.Server.isMacOS) {
      command = `cd "${CARoot}" && sudo -S security add-trusted-cert -d -r trustRoot -k "/Library/Keychains/System.keychain" "FlyEnv-Root-CA.crt"`
    } else if (window.Server.isWindows) {
      command = `certutil -addstore root "${CARootFile}"`
    } else {
      const caFileName = 'FlyEnv-Root-CA'
      command = `sudo sh -c 'if [ -d /usr/local/share/ca-certificates ]; then cp "'${CARootFile}'" "/usr/local/share/ca-certificates/'${caFileName}'" && update-ca-certificates; elif [ -d /etc/pki/ca-trust/source/anchors ]; then cp "'${CARootFile}'" "/etc/pki/ca-trust/source/anchors/'${caFileName}'" && update-ca-trust extract; else echo "Unsupported Linux distribution" && exit 1; fi'`
    }
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }
  const showFile = () => {
    const CARoot = join(window.Server.BaseDir!, 'CA/FlyEnv-Root-CA.crt')
    shell.showItemInFolder(CARoot)
  }
</script>
