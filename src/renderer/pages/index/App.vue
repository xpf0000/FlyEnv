<template>
  <div id="app">
    <mo-title-bar
      v-if="isRenderer()"
      :showActions="showWindowActions"
    />
    <router-view />
    <mo-ipc v-if="isRenderer()" />
  </div>
</template>

<script>
  import is from 'electron-is'
  import TitleBar from '@/components/Native/TitleBar'
  import Ipc from '@/components/Native/Ipc'
  import { mapState } from 'vuex'
  import { getLangDirection } from '@shared/utils'

  export default {
    name: 'BuildPhp',
    components: {
      [TitleBar.name]: TitleBar,
      [Ipc.name]: Ipc
    },
    computed: {
      ...mapState('task', {
        currentType: state => state.taskType,
        isRunning: state => state.taskRunning,
        taskResult: state => state.taskResult,
        taskVersion: state => state.taskVersion
      }),
      ...mapState('app', {
        systemTheme: state => state.systemTheme
      }),
      ...mapState('preference', {
        showWindowActions: state => {
          return (is.windows() || is.linux()) && state.config.hideAppMenu
        },
        rpcSecret: state => state.config.rpcSecret,
        theme: state => state.config.theme,
        locale: state => state.config.locale,
        password: state => state.config.password,
        dir: state => getLangDirection(state.config.locale)
      }),
      themeClass: function () {
        if (this.theme === 'auto') {
          return `theme-${this.systemTheme}`
        } else {
          return `theme-${this.theme}`
        }
      },
      i18nClass: function () {
        return `i18n-${this.locale}`
      },
      dirClass: function () {
        return `dir-${this.dir}`
      }
    },
    beforeMount: function () {
      this.updateRootClassName()
    },
    watch: {
      themeClass: function (val, oldVal) {
        this.updateRootClassName()
      },
      i18nClass: function (val, oldVal) {
        this.updateRootClassName()
      },
      dirClass: function (val, oldVal) {
        this.updateRootClassName()
      },
      password () {
        console.log('password is changed: ', this.password)
      }
    },
    created () {
      global.Server = this.$electron.remote.getGlobal('Server')
      console.log('App vue global.Server: ', global.Server)
      this.$electron.ipcRenderer.send('command', 'host', 'hostList')
      this.$EveBus.$on('vue:task-versions-success', _ => {
        let type = this.currentType.replace('-versions', '')
        let server = this.$store.state.preference.config.server
        if (!server[type]) {
          server[type] = {}
        }
        server[type].current = this.taskVersion
        this.$store.dispatch('preference/save', { server: server })
        this.$store.dispatch('task/result', '')
      })
      this.$EveBus.$on('vue:check-password', res => {
        if (res === false) {
          this.PassPrompt.editorErrorMessage = '密码错误,请重新输入'
        } else {
          global.Server.Password = res
          this.PassPromptDone && this.PassPromptDone()
        }
      })
      this.$EveBus.$on('vue:need-password', res => {
        this.checkPassword()
      })
      this.checkPassword()
    },
    destroyed () {
      this.$EveBus.$off('vue:task-versions-success')
    },
    mounted () {
    },
    methods: {
      isRenderer: is.renderer,
      updateRootClassName: function () {
        const { themeClass = '', i18nClass = '', dirClass = '' } = this
        const className = `${themeClass} ${i18nClass} ${dirClass}`
        document.documentElement.className = className
      },
      checkPassword () {
        let self = this
        if (!this.password) {
          this.$prompt('请输入电脑用户密码', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            inputType: 'password',
            customClass: 'password-prompt',
            beforeClose: function (action, instance, done) {
              if (action === 'confirm') {
                console.log(instance)
                if (instance.inputValue && instance.inputValue.trim().length > 0) {
                  self.PassPrompt = instance
                  self.PassPromptDone = done
                  self.$electron.ipcRenderer.send('command', 'password', instance.inputValue)
                }
              } else {
                done()
              }
            }
          }).then(({ value }) => {
          }).catch(err => {
            console.log('err: ', err)
          })
        }
      }
    }
  }
</script>

<style>
  .el-drawer__body {
    background: #1d2033;
  }
</style>
