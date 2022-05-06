<template>
  <div class="nginx-config">
    <el-input v-model="config" class="block" type="textarea"></el-input>
    <div class="tool">
      <el-button @click="openConfig">打开</el-button>
      <el-button @click="saveConfig">保存</el-button>
      <el-button @click="getDefault">加载默认</el-button>
    </div>
  </div>
</template>

<script>
  import { writeFileAsync, readFileAsync } from '@shared/file.js'

  const { existsSync } = require('fs')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  export default {
    name: 'MoNginxConfig',
    components: {},
    props: {},
    data() {
      return {
        config: ''
      }
    },
    computed: {},
    watch: {},
    created: function () {
      this.configpath = join(global.Server.NginxDir, 'common/conf/nginx.conf')
      this.getConfig()
    },
    methods: {
      openConfig() {
        shell.showItemInFolder(this.configpath)
      },
      saveConfig() {
        writeFileAsync(this.configpath, this.config).then(() => {
          this.$message.success('配置文件保存成功')
        })
      },
      getConfig() {
        readFileAsync(this.configpath).then((conf) => {
          this.config = conf
        })
      },
      getDefault() {
        let configpath = join(global.Server.NginxDir, 'common/conf/nginx.conf.default')
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
  .nginx-config {
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
