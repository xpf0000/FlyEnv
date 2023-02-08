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

  export default defineComponent({
    name: 'App',
    components: { TitleBar },
    data() {
      return {}
    },
    computed: {},
    watch: {},
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
          .title('关于我们')
          .noFooter()
          .show()
      },
      checkPassword() {
        passwordCheck().then(() => {
          installedVersions.allInstalledVersions('php')
          installedVersions.allInstalledVersions('nginx')
          installedVersions.allInstalledVersions('mysql')
          installedVersions.allInstalledVersions('apache')
          installedVersions.allInstalledVersions('memcached')
          installedVersions.allInstalledVersions('redis')
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
</style>
