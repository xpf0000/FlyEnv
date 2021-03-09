import { basename } from "path"
<template>
  <div class="php-extends">
  <el-table
    :data="tableData"
    size="medium"
    style="width: 100%">
    <el-table-column
      prop="name"
      label="名称"
      width="110">
    </el-table-column>
    <el-table-column
      prop="type"
      label="类型"
      width="80">
    </el-table-column>
    <el-table-column
      prop="info"
      label="说明">
    </el-table-column>

    <el-table-column align="center" label="状态" width="80">
    </el-table-column>

    <el-table-column align="center" label="操作" width="100">
      <template slot-scope="scope">
        <el-button
          size="mini"
          :loading="nowRunning === scope.row.name"
          @click="handleEdit(scope.$index, scope.row)" :disabled="!version || isRunning">{{scope.row.status ? '卸载' : '安装'}}</el-button>
      </template>
    </el-table-column>
  </el-table>

  </div>
</template>

<script>
  import { mapState } from 'vuex'
  import '@/components/Icons/task-start.js'
  import '@/components/Icons/task-stop.js'
  import { join, basename } from 'path'
  import FileUtil from '@shared/FileUtil'
  import { execAsync } from '@shared/utils'
  export default {
    name: 'mo-php-extends',
    data () {
      return {
        tableData: [{
          name: 'ionCube',
          type: '脚本解密',
          info: '用于解密ionCube Encoder加密脚本!',
          installed: false,
          status: false,
          soname: 'ioncube.so',
          inistr: '[ioncube]\nzend_extension=ioncube.so'
        }, {
          name: 'memcache',
          type: '缓存器',
          info: '强大的内容缓存器',
          installed: false,
          status: false,
          soname: 'memcache.so',
          inistr: '[memcache]\nextension=memcache.so'
        }, {
          name: 'memcached',
          type: '缓存器',
          info: '比memcache支持更多高级功能',
          installed: false,
          status: false,
          soname: 'memcached.so',
          inistr: '[memcached]\nextension=memcached.so'
        }, {
          name: 'redis',
          type: '缓存器',
          info: '基于内存亦可持久化的Key-Value数据库',
          installed: false,
          status: false,
          soname: 'redis.so',
          inistr: '[redis]\nextension=redis.so'
        }, {
          name: 'swoole',
          type: '网络通信',
          info: '异步、并行、高性能网络通信引擎',
          installed: false,
          status: false,
          soname: 'swoole.so',
          inistr: '[swoole]\nextension=swoole.so'
        }],
        iniPath: '',
        abc: '',
        extensionDir: ''
      }
    },
    components: {
    },
    props: {},
    computed: {
      ...mapState('app', {
        serverRunning: state => state.stat.php
      }),
      ...mapState('php', {
        nowRunning: state => state.taskVersion,
        logs: state => state.taskLog,
        isRunning: state => state.taskRunning
      }),
      ...mapState('preference', {
        version: state => state.config.server.php.current
      })
    },
    watch: {
    },
    methods: {
      handleEdit (index, row) {
        let name = row.name.toLowerCase()
        if (row.status) {
          this.$store.dispatch('php/start', { type: 'php-extends', v: row.name })
          this.$electron.ipcRenderer.send('command', 'php', 'unInstallExtends', name, this.iniPath)
        } else {
          this.$store.dispatch('php/start', { type: 'php-extends', v: row.name })
          this.$electron.ipcRenderer.send('command', 'php', 'installExtends', this.version, name, this.extensionDir, this.iniPath)
        }
      },
      checkStatus () {
        if (this.version) {
          this.iniPath = join(global.Server.PhpDir, 'common/conf/php.ini')
          let config = FileUtil.readFileAsync(this.iniPath)
          let brewVersion = this.version.replace('-', '@')
          let subVersion = brewVersion.replace('php@', '')
          let vpath = join(global.Server.BrewCellar, brewVersion, subVersion)
          console.log('vpath: ', vpath)
          let pkconfig = join(vpath, 'bin/php-config')
          let extdir = execAsync(pkconfig, ['--extension-dir'])
          let self = this
          Promise.all([extdir, config]).then(res => {
            console.log('res: ', res)
            self.extensionDir = join(vpath, 'lib/php', basename(res[0]))
            let all = FileUtil.getAllFile(self.extensionDir, false)
            all = all.filter(s => { return s.indexOf('.so') >= 0 })
            console.log('all: ', all)
            let ini = res[1]
            for (let item of self.tableData) {
              item.installed = all.indexOf(item.soname) >= 0
              item.status = item.installed && ini.indexOf(item.inistr) >= 0
            }
          })
        }
      }
    },
    created: function () {
      if (!this.$store.state.php.taskRunning) {
        this.$store.dispatch('php/cleanLog')
      }
      this.checkStatus()
      this.$EveBus.$on('vue:php-extends-stat', info => {
        console.log('vue:php-extends-stat: ', info)
        switch (info.flag) {
          case 'ioncube':
            this.tableData[0].status = info.status
            break
          case 'memcache':
            this.tableData[1].status = info.status
            break
          case 'memcached':
            this.tableData[2].status = info.status
            break
          case 'redis':
            this.tableData[3].status = info.status
            break
          case 'swoole':
            this.tableData[4].status = info.status
            break
        }
      })
    },
    destroyed () {
      this.$EveBus.$off('vue:php-extends-stat')
    }
  }
</script>

<style lang="scss">
  .php-extends{
    display: flex;
    flex-direction: column;
    max-height: 100%;
    padding: 20px;
    .logs{
      padding-left: 40px;
      flex: 1;
      width: 100%;
      display: flex;
      flex-direction: column;
      overflow: auto;
      >li{
        width: 100%;
      }
    }
  }
</style>
