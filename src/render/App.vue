<template>
  <TitleBar />
  <router-view />
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import TitleBar from './components/Native/TitleBar.vue'
  import { EventBus } from './global'
  import { passwordCheck } from '@/util/Brew'
  import IPC from '@/util/IPC'
  import installedVersions from '@/util/InstalledVersions'
  import { AppSofts, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'

  export default defineComponent({
    name: 'App',
    components: { TitleBar },
    data() {
      return {}
    },
    computed: {
      lang() {
        return AppStore().config.setup.lang
      },
      showItem() {
        return AppStore().config.setup.common.showItem
      }
    },
    watch: {
      lang: {
        handler(val) {
          const body = document.body
          body.className = `lang-${val}`
        },
        immediate: true
      },
      showItem: {
        handler() {
          this.onShowItemChange()
        },
        deep: true
      }
    },
    created() {
      EventBus.on('vue:need-password', this.checkPassword)
      IPC.on('application:about').then(this.showAbout)
      this.checkPassword()
    },
    unmounted() {
      EventBus.off('vue:need-password', this.checkPassword)
      IPC.off('application:about')
    },
    mounted() {},
    methods: {
      showItemLowcase() {
        const showItem: any = this.showItem
        const dict: { [key: string]: boolean } = {}
        for (const k in showItem) {
          dict[k.toLowerCase()] = showItem[k]
        }
        return dict
      },
      onShowItemChange() {
        const dict: { [key: string]: boolean } = this.showItemLowcase()
        const brewStore = BrewStore()
        for (const k in dict) {
          const brewSoft = brewStore?.[k]
          if (brewSoft && dict[k] && !brewSoft?.installedInited) {
            const flags = [k] as Array<keyof typeof AppSofts>
            installedVersions.allInstalledVersions(flags)
          }
        }
      },
      showAbout() {
        this.$baseDialog(import('./components/About/index.vue'))
          .className('about-dialog')
          .title(this.$t('base.about'))
          .noFooter()
          .show()
      },
      checkPassword() {
        passwordCheck().then(() => {
          const dict: { [key: string]: boolean } = this.showItemLowcase()
          console.log('showItem dict: ', dict)
          const flags: Array<keyof typeof AppSofts> = [
            'php',
            'nginx',
            'mysql',
            'apache',
            'memcached',
            'redis',
            'mongodb'
          ].filter((f) => dict[f]) as Array<keyof typeof AppSofts>
          console.log('flags: ', flags)
          installedVersions.allInstalledVersions(flags).then(() => {
            AppStore().versionInited = true
          })
        })
      }
    }
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
</style>
