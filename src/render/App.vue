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
  import { AppStore } from '@/store/app'

  export default defineComponent({
    name: 'App',
    components: { TitleBar },
    data() {
      return {}
    },
    computed: {
      lang() {
        return AppStore().config.setup.lang
      }
    },
    watch: {
      lang: {
        handler(val) {
          const body = document.body
          body.className = `lang-${val}`
        },
        immediate: true
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
      showAbout() {
        this.$baseDialog(import('./components/About/index.vue'))
          .className('about-dialog')
          .title(this.$t('base.about'))
          .noFooter()
          .show()
      },
      checkPassword() {
        passwordCheck()
          .then(() => {
            installedVersions.allInstalledVersions([
              'php',
              'nginx',
              'mysql',
              'apache',
              'memcached',
              'redis',
              'mongodb'
            ])
          })
          .then(() => {
            AppStore().versionInited = true
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
