<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ $t('setup.autoLaunch') }}</span>
    <el-popover placement="top" width="auto">
      <template #reference>
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
      </template>
      <template #default>
        <span>{{ $t('setup.autoLaunchTips') }}</span>
      </template>
    </el-popover>
  </div>
  <div class="main reset-pass">
    <el-switch v-model="autoLaunch"></el-switch>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'
  import { app, fs, exec } from '@/util/NodeFn'
  import { join } from '@/util/path-browserify'
  import { MessageError } from '@/util/Element'

  const isMacOS = computed(() => {
    return window.Server.isMacOS
  })
  const isWindows = computed(() => {
    return window.Server.isWindows
  })
  const isLinux = computed(() => {
    return window.Server.isLinux
  })

  const store = AppStore()

  async function setAutoStart(enable: boolean) {
    const exePath = (await app.getPath('exe')).replace(/"/g, '\\"')
    const taskName = 'FlyEnvStartup'
    if (enable) {
      const tmpl = await fs.readFile(
        join(window.Server.Static!, 'sh/flyenv-auto-start.ps1'),
        'utf-8'
      )
      const content = tmpl.replace('#EXECPATH#', exePath)
      try {
        await fs.mkdirp(window.Server.Cache!)
        const file = join(window.Server.Cache!, 'flyenv-auto-start.ps1')
        await fs.writeFile(file, content)
        const res = await exec.exec(
          `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '${file}'; & '${file}'"`,
          { shell: true }
        )
        console.log('file: ', file)
        console.log('res: ', res.stdout, res.stderr)
        await fs.remove(file)
        return true
      } catch (e: any) {
        MessageError(`${e.toString()}`)
        throw e
      }
    } else {
      try {
        await exec.exec(`schtasks /delete /tn "${taskName}" /f`)
      } catch {}
      return true
    }
  }

  const autoLaunch = computed({
    get() {
      return store.config.setup?.autoLaunch ?? false
    },
    set(v) {
      if (isMacOS.value) {
        store.config.setup.autoLaunch = v
        app.setLoginItemSettings({
          openAtLogin: v
        })
        store.saveConfig()
        return
      }
      if (isWindows.value) {
        setAutoStart(v)
          .then(() => {
            store.config.setup.autoLaunch = v
            store.saveConfig()
          })
          .catch()
      }
    }
  })

  const sysnAutoLunach = () => {
    const setting: any = app.getLoginItemSettings()
    console.log('setting: ', setting)
    if (store.config.setup?.autoLaunch !== setting.openAtLogin) {
      store.config.setup.autoLaunch = setting.openAtLogin
    }
  }
  if (isMacOS.value) {
    sysnAutoLunach()
  }
</script>
