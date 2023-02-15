<template>
  <div class="mysql-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button :disabled="!currentVersion" @click="openConfig">{{ $t('base.open') }}</el-button>
      <el-button :disabled="!currentVersion" @click="saveConfig">{{ $t('base.save') }}</el-button>
      <el-button :disabled="!currentVersion" @click="getDefault">{{
        $t('base.loadDefault')
      }}</el-button>
    </div>
  </div>
</template>

<script lang="ts">
  import { readFileAsync, writeFileAsync } from '@shared/file'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { nextTick, defineComponent } from 'vue'
  import { AppStore } from '@/store/app'

  const { existsSync } = require('fs')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  export default defineComponent({
    name: 'MoMysqlConfig',
    components: {},
    props: {},
    data() {
      return {
        config: '',
        realDir: '',
        configPath: '',
        typeFlag: 'mysql'
      }
    },
    computed: {
      currentVersion() {
        return AppStore().config?.server?.mysql?.current?.version
      }
    },
    watch: {},
    created: function () {},
    mounted() {
      if (!this.currentVersion) {
        this.config = this.$t('base.needSelectVersion')
        this.$message.error(this.config)
      } else {
        const v = this.currentVersion.split('.').slice(0, 2).join('.')
        this.configPath = join(global.Server.MysqlDir, `my-${v}.cnf`)
        this.getConfig()
      }
      nextTick().then(() => {
        this.initEditor()
      })
    },
    unmounted() {
      this.monacoInstance && this.monacoInstance.dispose()
      this.monacoInstance = null
    },
    methods: {
      openConfig() {
        shell.showItemInFolder(this.configPath)
      },
      saveConfig() {
        const content = this.monacoInstance.getValue()
        writeFileAsync(this.configPath, content).then(() => {
          this.$message.success(this.$t('base.success'))
        })
      },
      getConfig() {
        if (!existsSync(this.configPath)) {
          this.config = this.$t('base.needSelectVersion')
          const appStore = AppStore()
          appStore.config.server.mysql.current = {}
          appStore.saveConfig()
          return
        }
        readFileAsync(this.configPath).then((conf) => {
          this.config = conf
          this.initEditor()
        })
      },
      getDefault() {
        const oldm = join(global.Server.MysqlDir, 'my.cnf')
        const dataDir = join(global.Server.MysqlDir, `data-${this.currentVersion}`)
        this.config = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION

#设置数据目录
#brew安装的mysql, 数据目录是一样的, 会导致5.x版本和8.x版本无法互相切换, 所以为每个版本单独设置自己的数据目录
#如果配置文件已更改, 原配置文件在: ${oldm}
#可以复制原配置文件的内容, 使用原来的配置
datadir=${dataDir}`
        this.initEditor()
      },
      initEditor() {
        if (!this.monacoInstance) {
          const input: HTMLElement = this?.$refs?.input as HTMLElement
          if (!input || !input?.style) {
            return
          }
          this.monacoInstance = editor.create(input, {
            value: this.config,
            language: 'ini',
            theme: 'vs-dark',
            readOnly: !this.currentVersion,
            scrollBeyondLastLine: true,
            overviewRulerBorder: true,
            automaticLayout: true
          })
        } else {
          this.monacoInstance.setValue(this.config)
          this.monacoInstance.updateOptions({
            readOnly: !this.currentVersion
          })
        }
      }
    }
  })
</script>

<style lang="scss">
  .mysql-config {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    padding: 10px 0 0 20px;
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
</style>
