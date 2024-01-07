<template>
  <TitleBar />
  <router-view />
  <AI v-if="showAI" />
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
  import AI from '@/components/AI/index.vue'
  import { I18nT } from '@shared/lang'
  import Base from '@/core/Base'

  const inited = ref(false)
  const appStore = AppStore()
  const brewStore = BrewStore()

  const lang = computed(() => {
    return appStore.config.setup.lang
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const showAI = computed(() => {
    return appStore?.config?.setup?.showAIRobot ?? true
  })

  const showItemLowcase = () => {
    const dict: { [key: string]: boolean } = {}
    const all = showItem.value as any
    for (const k in all) {
      let key = k.toLowerCase()
      if (key === 'ftp') {
        key = 'pure-ftpd'
      }
      dict[key] = all[k]
    }
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
      .noFooter()
      .show()
  }

  const checkPassword = () => {
    passwordCheck().then(() => {
      const dict: { [key: string]: boolean } = showItemLowcase()
      console.log('showItem dict: ', dict)
      const flags: Array<keyof typeof AppSofts> = [
        'php',
        'nginx',
        'mysql',
        'mariadb',
        'apache',
        'memcached',
        'redis',
        'mongodb',
        'pure-ftpd',
        'postgresql'
      ].filter((f) => dict?.[f] !== false) as Array<keyof typeof AppSofts>
      if (flags.length === 0) {
        AppStore().versionInited = true
        inited.value = true
        return
      }
      installedVersions.allInstalledVersions(flags).then(() => {
        AppStore().versionInited = true
        inited.value = true
      })
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

  onMounted(() => {
    checkPassword()
    brewStore.cardHeadTitle = I18nT('base.currentVersionLib')
  })

  onUnmounted(() => {
    EventBus.off('vue:need-password', checkPassword)
    IPC.off('application:about')
  })
</script>

<style lang="scss">
  html,
  body,
  #app {
    min-height: 100vh;
    min-width: 100vw;
    overflow: hidden;
  }

  .el-drawer {
    background: #1d2033 !important;
    background-color: #1d2033 !important;

    .el-drawer__body {
      background: #1d2033 !important;
      padding: 0 !important;
    }
  }

  .el-table .cell {
    padding: 0 12px;
    line-height: 2.3;
  }

  .version-error-tips {
    max-width: 50vw !important;
    font-size: 14px !important;
  }

  .soft-index-panel {
    height: 100%;
    overflow: auto;
    line-height: 1.75;
    padding: 30px 18px;
    display: flex;
    flex-direction: column;
    > .top-tab {
      width: 100%;
      display: flex;
      align-items: center;
      margin-bottom: 20px;
      flex-shrink: 0;
      > li {
        user-select: none;
        cursor: pointer;
        min-width: 100px;
        padding: 0 12px;
        height: 36px;
        margin-right: 20px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        &:hover {
          background-color: #3e4257;
        }
        &.active {
          background: #3e4257;
        }
      }
    }
    .main-block {
      flex: 1;
      width: 100%;
      overflow: hidden;
    }
  }

  .ssl-make {
    width: 100%;
    height: 100%;
    background: #1d2033;
    display: flex;
    flex-direction: column;
    user-select: none;
    .nav {
      height: 76px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      background: #282b3d;
      .left {
        cursor: pointer;
        display: flex;
        align-items: center;
        padding: 6px 0;
      }
    }
    .main-wapper {
      flex: 1;
      width: 100%;
      overflow: auto;
      padding: 12px;
      color: rgba(255, 255, 255, 0.7);
      &::-webkit-scrollbar {
        width: 0;
        height: 0;
        display: none;
      }
      input.input {
        background: transparent;
        border-top: none;
        border-left: none;
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.7);
        outline: none;
        height: 42px;
        color: #fff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        &::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        &:hover {
          border-bottom: 2px solid rgba(255, 255, 255, 0.7);
        }
        &:focus {
          border-bottom: 2px solid #01cc74;
        }
        &.error {
          border-bottom: 2px solid #cc5441;
        }
      }
      .el-select {
        &.error {
          .el-input__wrapper {
            border: 1px solid #cc5441;
          }
        }
      }
      .input-textarea {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.7);
        outline: none;
        height: 120px;
        color: #fff;
        margin-top: 20px;
        border-radius: 8px;
        padding: 10px;
        resize: none;
        line-height: 1.6;
        &::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        &:hover {
          border: 2px solid rgba(255, 255, 255, 0.7);
        }
        &:focus {
          border: 2px solid #01cc74;
        }
        &.nginx-rewrite {
          height: 140px;
          margin-top: 20px;
        }
        &.error {
          border: 2px solid #cc5441;
        }
      }
      .main {
        background: #32364a;
        border-radius: 8px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        .path-choose {
          display: flex;
          align-items: flex-end;
          .input {
            flex: 1;
          }
          .icon-block {
            margin-left: 30px;
            display: flex;
            .choose {
              color: #01cc74;
            }
          }
        }
        .ssl-switch {
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .port-set {
          display: flex;
          align-items: flex-end;
          .port-type {
            width: 50px;
            margin-right: 30px;
            flex-shrink: 0;
          }
          .input {
            flex: 1;
            &::-webkit-outer-spin-button {
              -webkit-appearance: none !important;
              margin: 0;
            }
            &::-webkit-inner-spin-button {
              -webkit-appearance: none !important;
              margin: 0;
            }
          }
          &.port-ssl {
            .input {
              margin-right: 48px;
            }
          }
        }
      }
      .plant-title {
        padding: 22px 24px;
        font-size: 15px;
        font-weight: 600;
      }
    }
  }

  body.lang-en {
    .apache-service {
      .left-title {
        width: 110px;
      }
    }

    .nodejs-versions {
      .left-title {
        width: 110px;
      }
    }
  }

  .cli-to-html {
    word-wrap: break-word;
    white-space: pre-wrap;
    user-select: text;
  }

  .module-config {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    padding: 5px 0 0 0;
    .block {
      width: 100%;
      flex: 1;
      overflow: hidden;
    }
    .tool {
      flex-shrink: 0;
      width: 100%;
      display: flex;
      align-items: center;
      padding: 30px 0 0;
    }
  }

  .app-el-message {
    width: max-content !important;
    max-width: 70vw;
    max-height: 70vh;
    overflow: auto;

    .el-message__content {
      word-wrap: break-word;
      white-space: pre-wrap;
      user-select: text;
    }
  }
</style>
