<template>
  <div class="mysql-config">
    <el-input v-model="config" class="block" :disabled="!currentVersion" type="textarea"></el-input>
    <div class="tool">
      <el-button :disabled="!currentVersion" @click="openConfig">打开</el-button>
      <el-button :disabled="!currentVersion" @click="saveConfig">保存</el-button>
      <el-button :disabled="!currentVersion" @click="getDefault">加载默认</el-button>
    </div>
  </div>
</template>

<script>
  import { readFileAsync, writeFileAsync } from '@shared/file.js'
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
    computed: {
      currentVersion() {
        return this?.server?.mysql?.current?.version
      }
    },
    watch: {},
    created: function () {
      console.log('this.server: ', this.server)
      if (!this.version || !this.version.version) {
        this.config = '请先选择版本'
        return
      }
      this.configPath = join(global.Server.MysqlDir, `my-${this.version.version}.cnf`)
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
        if (!existsSync(this.configPath)) {
          this.config = '版本已变更, 请重新切换选择版本'
          this.server.mysql.current = {}
          this.$store.dispatch('app/saveConfig').then()
          return
        }
        readFileAsync(this.configPath).then((conf) => {
          this.config = conf
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
