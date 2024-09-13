<template>
  <TitleBar />
  <router-view />
  <FloatButton />
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import TitleBar from './components/Native/TitleBar.vue'
  import { EventBus } from './global'
  import { passwordCheck } from '@/util/Brew'
  import IPC from '@/util/IPC'
  import installedVersions from '@/util/InstalledVersions'
  import { AppSofts, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { I18nT } from '@shared/lang'
  import Base from '@/core/Base'
  import { MessageSuccess } from '@/util/Element'
  import FloatButton from '@/components/FloatBtn/index.vue'
  import { ElMessageBox } from 'element-plus'

  const inited = ref(false)
  const appStore = AppStore()
  const brewStore = BrewStore()

  const lang = computed(() => {
    return appStore.config.setup.lang
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const showItemLowcase = () => {
    const dict: { [key: string]: boolean } = {}
    const all: any = Object.assign(
      {
        PostgreSql: true,
        java: true,
        tomcat: true
      },
      showItem.value
    )
    for (const k in all) {
      let key = k.toLowerCase()
      if (key === 'ftp') {
        key = 'pure-ftpd'
      }
      dict[key] = all[k] !== false
    }
    console.log('dict: ', dict)
    return dict
  }

  const onShowItemChange = () => {
    if (!inited.value) {
      return
    }
    const dict: { [key: string]: boolean } = showItemLowcase()
    const store: any = brewStore
    for (const k in dict) {
      const brewSoft = store?.[k]
      if (brewSoft && dict[k] && !brewSoft?.installedInited) {
        const flags = [k] as Array<keyof typeof AppSofts>
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
      const dict: { [key: string]: boolean } = showItemLowcase()
      console.log('showItem dict: ', dict)
      const flags: Array<keyof typeof AppSofts> = [
        'php',
        'caddy',
        'nginx',
        'mysql',
        'mariadb',
        'apache',
        'memcached',
        'redis',
        'mongodb',
        'pure-ftpd',
        'postgresql',
        'tomcat'
      ].filter((f) => dict?.[f] !== false) as Array<keyof typeof AppSofts>
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
    checkPassword()
    brewStore.cardHeadTitle = I18nT('base.currentVersionLib')
  })

  onUnmounted(() => {
    EventBus.off('vue:need-password', checkPassword)
    IPC.off('application:about')
    IPC.off('application:need-password')
  })
</script>
