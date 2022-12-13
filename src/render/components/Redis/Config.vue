<template>
  <div class="redis-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button :disabled="!version" @click="openConfig">打开</el-button>
      <el-button :disabled="!version" @click="saveConfig">保存</el-button>
      <el-button :disabled="!version" @click="getDefault">加载默认</el-button>
    </div>
  </div>
</template>

<script>
  import { writeFileAsync, readFileAsync } from '@shared/file.js'
  import { AppMixins } from '@/mixins/AppMixins.js'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { nextTick } from 'vue'

  const { existsSync } = require('fs')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  export default {
    name: 'MoRedisConfig',
    components: {},
    mixins: [AppMixins],
    props: {},
    data() {
      return {
        config: '',
        realDir: '',
        configPath: '',
        typeFlag: 'redis'
      }
    },
    watch: {},
    created: function () {
      this.configPath = join(global.Server.RedisDir, 'common/redis.conf')
      this.getConfig()
    },
    mounted() {
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
          this.$message.success('配置文件保存成功!')
        })
      },
      getConfig() {
        console.log('this.configPath: ', this.configPath)
        readFileAsync(this.configPath).then((conf) => {
          this.config = conf
          this.initEditor()
        })
      },
      getDefault() {
        let configPath = join(global.Server.RedisDir, 'common/redis.conf.default')
        if (!existsSync(configPath)) {
          this.$message.error('未找到默认配置文件!')
          return
        }
        readFileAsync(configPath).then((conf) => {
          this.config = conf
          this.initEditor()
        })
      },
      initEditor() {
        if (!this.monacoInstance) {
          if (!this?.$refs?.input?.style) {
            return
          }
          this.monacoInstance = editor.create(this.$refs.input, {
            value: this.config,
            language: 'ini',
            theme: 'vs-dark',
            scrollBeyondLastLine: true,
            overviewRulerBorder: true,
            automaticLayout: true
          })
        } else {
          this.monacoInstance.setValue(this.config)
        }
      }
    }
  }
</script>

<style lang="scss">
  .redis-config {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    padding: 20px 0 0 20px;
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
      padding: 30px 0;
    }
  }
</style>
