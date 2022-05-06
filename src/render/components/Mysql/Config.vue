<template>
  <div class="mysql-config">
    <el-input v-model="config" class="block" type="textarea"></el-input>
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

  const { existsSync } = require('fs')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  export default {
    name: 'MoMysqlConfig',
    components: {},
    mixins: [AppMixins],
    props: {},
    data() {
      return {
        config: '',
        realDir: '',
        configPath: '',
        typeFlag: 'mysql'
      }
    },
    watch: {},
    created: function () {
      this.configPath = join(global.Server.MysqlDir, 'my.cnf')
      this.getConfig()
    },
    methods: {
      openConfig() {
        shell.showItemInFolder(this.configPath)
      },
      saveConfig() {
        writeFileAsync(this.configPath, this.config).then(() => {
          this.$message.success('配置文件保存成功!')
        })
      },
      getConfig() {
        readFileAsync(this.configPath).then((conf) => {
          this.config = conf
        })
      },
      getDefault() {
        let configPath = join(global.Server.MysqlDir, 'my.cnf.default')
        if (!existsSync(configPath)) {
          this.$message.error('未找到默认配置文件!')
          return
        }
        readFileAsync(configPath).then((conf) => {
          this.config = conf
        })
      }
    }
  }
</script>

<style lang="scss">
  .mysql-config {
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
