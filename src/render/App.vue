<template>
  <TitleBar />
  <router-view />
  <FloatButton />
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
  import TitleBar from './components/Native/TitleBar.vue'
  import { EventBus } from './global'
  import { passwordCheck } from '@/util/Brew'
  import IPC from '@/util/IPC'
  import installedVersions from '@/util/InstalledVersions'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { I18nT } from '@shared/lang'
  import Base from '@/core/Base'
  import { MessageSuccess } from '@/util/Element'
  import FloatButton from '@/components/FloatBtn/index.vue'
  import { ElMessageBox } from 'element-plus'
  import { type AllAppModule, AppModuleEnum } from '@/core/type'
  import { AppModules } from '@/core/App'

  const inited = ref(false)
  const appStore = AppStore()
  const brewStore = BrewStore()

  const lang = computed(() => {
    return appStore.config.setup.lang
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const allService = AppModules.filter((m) => m.isService).map((m) => m.typeFlag)

  const onShowItemChange = () => {
    if (!inited.value) {
      return
    }
    let k: AllAppModule
    for (k of allService) {
      const module = brewStore.module(k)
      if (showItem?.value?.[k] !== false && !module.installedInited) {
        const flags = [k]
        installedVersions.allInstalledVersions(flags)
      }
    }
  }

  const showAbout = () => {
    Base.Dialog(import('./components/About/index.vue'))
      .className('about-dialog')
      .title(I18nT('base.about'))
      .width('665px')
      .noFooter()
      .show()
  }

  const checkPassword = () => {
    passwordCheck().then(() => {
      checkProxy()
      const flags: Array<AllAppModule> = allService.filter(
        (f: AllAppModule) => showItem?.value?.[f] !== false
      ) as Array<keyof typeof AppModuleEnum>
      if (flags.length === 0) {
        appStore.versionInited = true
        inited.value = true
        return
      }
      installedVersions.allInstalledVersions(flags).then(() => {
        appStore.versionInited = true
        inited.value = true
      })
      if (appStore.hosts.length === 0) {
        appStore.initHost().then()
      }
    })
  }

  const checkProxy = () => {
    if (appStore?.config?.setup?.proxy?.on) {
      return
    }
    const checked = localStorage.getItem('PhpWebStudy-Checked-Proxy')
    if (checked) {
      return
    }
    IPC.send('app-fork:tools', 'sysetmProxy').then((key: string, res: any) => {
      IPC.off(key)
      console.log('sysetmProxy: ', res)
      const proxy = res?.data ?? {}
      if (Object.keys(proxy).length > 0) {
        Base._Confirm(I18nT('tools.systemProxyChech'), undefined, {
          customClass: 'confirm-del',
          type: 'warning'
        }).then(() => {
          const arr: string[] = ['export']
          for (const k in proxy) {
            arr.push(`${k}=${proxy[k]}`)
          }
          appStore.config.setup.proxy.on = true
          appStore.config.setup.proxy.proxy = arr.join(' ')
          appStore.saveConfig()
          MessageSuccess(I18nT('tools.systemProxyUsed'))
        })
        localStorage.setItem('PhpWebStudy-Checked-Proxy', 'true')
      }
    })
  }

  EventBus.on('vue:need-password', checkPassword)
  IPC.on('application:about').then(showAbout)

  watch(
    lang,
    (val) => {
      const body = document.body
      body.className = `lang-${val}`
    },
    {
      immediate: true
    }
  )

  watch(
    showItem,
    () => {
      onShowItemChange()
    },
    {
      deep: true
    }
  )
  let passChecking = false

  IPC.on('application:need-password').then(() => {
    if (passChecking) {
      return
    }
    passChecking = true
    ElMessageBox.prompt(I18nT('base.inputPasswordDesc'), I18nT('base.inputPassword'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      inputType: 'password',
      customClass: 'password-prompt',
      beforeClose: (action, instance, done) => {
        if (action === 'confirm') {
          // 去除trim, 有些电脑的密码是空格...
          if (instance.inputValue) {
            IPC.send('app:password-check', instance.inputValue).then((key: string, res: any) => {
              IPC.off(key)
              if (res === false) {
                instance.editorErrorMessage = I18nT('base.passwordError')
              } else {
                global.Server.Password = res
                AppStore().initConfig().then()
                checkPassword()
                done && done()
              }
              passChecking = false
            })
          }
        } else {
          passChecking = false
          done()
        }
      }
    })
  })

  onMounted(() => {
    nextTick().then(() => {
      checkPassword()
    })
    brewStore.cardHeadTitle = I18nT('base.currentVersionLib')
  })

  onUnmounted(() => {
    EventBus.off('vue:need-password', checkPassword)
    IPC.off('application:about')
    IPC.off('application:need-password')
  })
</script>
