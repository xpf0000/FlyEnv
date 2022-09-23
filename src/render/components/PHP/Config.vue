<template>
  <div class="php-config">
    <el-input
      v-model="config"
      :disabled="!configpath || phpRunning"
      class="block"
      type="textarea"
    ></el-input>
    <div class="tool">
      <el-button :disabled="!configpath" @click="openConfig">打开</el-button>
      <el-button :disabled="!configpath" @click="saveConfig">保存</el-button>
      <el-button :disabled="!configpath" @click="getDefault">加载默认</el-button>
    </div>
  </div>
</template>

<script>
  import { writeFileAsync, readFileAsync } from '@shared/file.js'
  import { mapGetters } from 'vuex'
  import IPC from '@/util/IPC.js'
  import { reloadService } from '@/util/Service.js'

  const { existsSync } = require('fs')
  const { shell } = require('@electron/remote')

  const IniFiles = {}

  export default {
    name: 'MoPhpConfig',
    components: {},
    props: {},
    data() {
      return {
        config: '',
        configpath: ''
      }
    },
    computed: {
      ...mapGetters('app', {
        server: 'server',
        stat: 'stat'
      }),
      phpRunning() {
        return this?.state?.php ?? false
      },
      version() {
        return this.server?.php?.current ?? {}
      },
      versionDir() {
        return this.server?.php?.current?.path ?? ''
      }
    },
    watch: {
      versionDir: {
        handler(val) {
          if (val) {
            this.getConfig()
          }
        },
        immediate: true
      }
    },
    created: function () {},
    methods: {
      openConfig() {
        if (this.configpath) {
          shell.showItemInFolder(this.configpath)
        }
      },
      saveConfig() {
        if (!this.configpath) {
          return
        }
        writeFileAsync(this.configpath, this.config).then(() => {
          this.$message.success('配置文件保存成功')
          reloadService('php', this.version)
        })
      },
      getConfig() {
        if (!this.versionDir) {
          this.config = '请先选择PHP版本'
          return
        }
        const readConfig = () => {
          this.configpath = IniFiles[this.versionDir]
          readFileAsync(this.configpath).then((conf) => {
            this.config = conf
          })
        }
        if (!IniFiles[this.versionDir]) {
          IPC.send('app-fork:php', 'getIniPath', this.versionDir).then((key, res) => {
            console.log(res)
            IPC.off(key)
            if (res.code === 0) {
              IniFiles[this.versionDir] = res.iniPath
              readConfig()
            } else {
              this.$message.error('php.ini文件获取失败')
              this.config = 'php.ini文件获取失败'
            }
          })
        } else {
          readConfig()
        }
      },
      getDefault() {
        if (!this.configpath) {
          return
        }
        let configpath = `${this.configpath}.default`
        if (!existsSync(configpath)) {
          this.$message.error('未找到默认配置文件')
          return
        }
        readFileAsync(configpath).then((conf) => {
          this.config = conf
        })
      }
    }
  }
</script>

<style lang="scss">
  .php-config {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px 0 0 20px;
    .block {
      display: flex;
      align-items: center;
      flex: 1;
      font-size: 15px;
      textarea {
        height: 100%;
      }
    }
    .tool {
      flex-shrink: 0;
      width: 100%;
      display: flex;
      align-items: center;
      padding: 30px 0;
    }
  }
</style>
