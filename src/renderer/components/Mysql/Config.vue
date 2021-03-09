
<template>
  <div class="mysql-config">
    <el-input class="block" type="textarea" v-model="config"></el-input>
    <div class="tool">
      <el-button :disabled="!version" @click="openConfig" >打开</el-button>
      <el-button :disabled="!version" @click="saveConfig" >保存</el-button>
      <el-button :disabled="!version" @click="getDefault" >加载默认</el-button>
    </div>
  </div>
</template>

<script>
  import { mapState } from 'vuex'
  import '@/components/Icons/task-start.js'
  import '@/components/Icons/task-stop.js'
  import { join } from 'path'
  import { existsSync } from 'fs'
  import FileUtil from '@shared/FileUtil'
  export default {
    name: 'mo-mysql-config',
    data () {
      return {
        config: '',
        realDir: '',
        configPath: ''
      }
    },
    components: {
    },
    props: {},
    computed: {
      ...mapState('preference', {
        version: state => state.config.server.mysql.current
      })
    },
    watch: {
      version () {
        this.getConfig()
      }
    },
    methods: {
      openConfig () {
        this.$electron.remote.shell.showItemInFolder(this.configPath)
      },
      saveConfig () {
        FileUtil.writeFileAsync(this.configPath, this.config).then(conf => {
          this.$message.success('配置文件保存成功!')
        })
      },
      getConfig () {
        if (this.version) {
          let brewVersion = this.version.replace('-', '@')
          let subVersion = brewVersion.replace('mysql@', '')
          this.realDir = join(global.Server.BrewCellar, brewVersion, subVersion)
          this.configPath = join(this.realDir, 'my.cnf')
          FileUtil.readFileAsync(this.configPath).then(conf => {
            this.config = conf
          })
        } else {
          this.realDir = ''
          this.configPath = ''
          this.config = '未选择版本!'
        }
      },
      getDefault () {
        let configpath = join(this.realDir, 'my.cnf.default')
        if (!existsSync(configpath)) {
          this.$message.error('未找到默认配置文件!')
          return
        }
        FileUtil.readFileAsync(configpath).then(conf => {
          this.config = conf
        })
      }
    },
    created: function () {
      this.getConfig()
    }
  }
</script>

<style lang="scss">
  .mysql-config{
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px 0 0 20px;
    .block{
      display: flex;
      align-items: center;
      flex: 1;
      font-size: 15px;
      textarea{
        height: 100%;
      }
    }
    .tool{
      flex-shrink: 0;
      width: 100%;
      display: flex;
      align-items: center;
      padding: 30px 0;
    }
  }
</style>
