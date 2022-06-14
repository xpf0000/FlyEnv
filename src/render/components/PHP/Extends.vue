import {join} from "path";import {basename} from "path";
<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span> {{ headerTitle }} </span>
        <el-button v-if="showNextBtn" type="primary" @click="toNext">确定</el-button>
        <el-button
          v-else
          class="button"
          :disabled="extendRefreshing || extendRunning"
          type="text"
          @click="getTableData"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': extendRefreshing || extendRunning }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <ul v-if="currentExtend" ref="logs" class="logs">
      <li v-for="(log, index) in logs" :key="index" class="mb-5" v-html="log"></li>
    </ul>
    <el-table v-else height="100%" :data="showTableData" size="medium" style="width: 100%">
      <el-table-column prop="name" label="名称"> </el-table-column>
      <el-table-column prop="type" label="类型"> </el-table-column>
      <el-table-column align="center" label="状态">
        <template #default="scope">
          <yb-icon
            v-if="scope.row.status"
            :svg="import('@/svg/ok.svg?raw')"
            class="installed"
          ></yb-icon>
        </template>
      </el-table-column>

      <el-table-column align="left" label="操作">
        <template #default="scope">
          <el-button v-if="scope.row.status" type="text" @click="copyLink(scope.$index, scope.row)"
            >复制链接</el-button
          >
          <el-button v-else type="text" @click="handleEdit(scope.$index, scope.row)"
            >安装</el-button
          >
          <el-button
            v-if="scope.row.status && scope.row.name === 'xdebug'"
            type="text"
            @click="copyXDebugTmpl(scope.$index, scope.row)"
            >复制配置模板</el-button
          >
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script>
  import IPC from '@/util/IPC.js'
  import { AppMixins } from '@/mixins/AppMixins.js'
  import { mapGetters } from 'vuex'
  import { getAllFile } from '@shared/file.js'
  import { execAsync } from '@shared/utils.js'
  import { reloadService } from '@/util/Service.js'

  const { join } = require('path')
  const { clipboard } = require('@electron/remote')

  export default {
    components: {},
    mixins: [AppMixins],
    data() {
      return {
        showNextBtn: false,
        typeFlag: 'php',
        tableData: [
          {
            name: 'ionCube',
            type: '脚本解密',
            info: '用于解密ionCube Encoder加密脚本!',
            installed: false,
            status: false,
            soname: 'ioncube.so',
            extendPre: 'zend_extension='
          },
          {
            name: 'memcache',
            type: '缓存器',
            info: '强大的内容缓存器',
            installed: false,
            status: false,
            soname: 'memcache.so'
          },
          {
            name: 'memcached',
            type: '缓存器',
            info: '比memcache支持更多高级功能',
            installed: false,
            status: false,
            soname: 'memcached.so'
          },
          {
            name: 'redis',
            type: '缓存器',
            info: '基于内存亦可持久化的Key-Value数据库',
            installed: false,
            status: false,
            soname: 'redis.so'
          },
          {
            name: 'swoole',
            type: '网络通信',
            info: '异步、并行、高性能网络通信引擎',
            installed: false,
            status: false,
            soname: 'swoole.so'
          },
          {
            name: 'xdebug',
            type: '调试器',
            info: '开源的PHP程序调试器',
            installed: false,
            status: false,
            soname: 'xdebug.so',
            extendPre: 'zend_extension='
          }
        ],
        showTableData: []
      }
    },
    computed: {
      ...mapGetters('task', {
        taskPhp: 'php'
      }),
      ...mapGetters('app', {
        stat: 'stat'
      }),
      serverRunning() {
        return this.stat.php
      },
      isRunning() {
        return this.taskPhp.running
      },
      logs() {
        return this.taskPhp.log
      },
      extendRunning() {
        return this.taskPhp.extendRunning
      },
      currentExtend() {
        return this.taskPhp.currentExtend
      },
      extendAction() {
        return this.taskPhp.extendAction
      },
      extendRefreshing() {
        return this.taskPhp.extendRefreshing
      },
      headerTitle() {
        if (this.currentExtend) {
          return `${this.extendAction} ${this.currentExtend}`
        } else if (this.version) {
          return `PHP 版本${this.version.version} 可用扩展`
        } else {
          return '请先选择PHP版本'
        }
      },
      versionNumber() {
        if (this.version?.version) {
          let versionNums = this.version.version.split('.')
          versionNums.splice(2)
          versionNums = versionNums.join('.')
          return parseFloat(versionNums)
        }
        return 0
      },
      logLength() {
        return this.logs.length
      }
    },
    watch: {
      'version.version': {
        handler() {
          this.taskPhp.extendRefreshing = false
          this.getTableData()
        },
        immediate: true
      },
      logLength() {
        this.$nextTick(() => {
          let container = this.$refs['logs']
          if (container) {
            container.scrollTop = container.scrollHeight
          }
        })
      }
    },
    created: function () {
      if (!this.taskPhp.extendRunning) {
        this.taskPhp.currentExtend = ''
        this.taskPhp.extendAction = ''
      }
    },
    unmounted() {},
    methods: {
      getTableData() {
        if (this.extendRefreshing) {
          return
        }
        this.taskPhp.extendRefreshing = true
        this.showTableData = JSON.parse(JSON.stringify(this.tableData))
        if (this.versionNumber > 0 && (this.versionNumber < 5.4 || this.versionNumber > 7.4)) {
          this.showTableData.splice(0, 1)
        }
        this.checkStatus()
      },
      checkStatus() {
        if (this.version?.version) {
          let pkconfig = join(this.version.path, 'bin/php-config')
          execAsync(pkconfig, ['--extension-dir']).then((res) => {
            this.installExtensionDir = res
            let all = getAllFile(this.installExtensionDir, false)
            all = all.filter((s) => {
              return s.indexOf('.so') >= 0
            })
            console.log('all: ', all)
            for (let item of this.showTableData) {
              item.installed = all.indexOf(item.soname) >= 0
              item.status = item.installed
              item.soPath = join(this.installExtensionDir, item.soname)
            }
            this.taskPhp.extendRefreshing = false
          })
        }
      },
      handleEdit(index, row) {
        console.log(index, row)
        if (this.extendRunning) {
          return
        }
        this.logs.splice(0)
        this.taskPhp.extendRunning = true
        this.taskPhp.currentExtend = row.name
        this.taskPhp.extendAction = row.status ? '卸载' : '安装'
        const fn = row.status ? 'unInstallExtends' : 'installExtends'
        const args = JSON.parse(
          JSON.stringify({
            version: this.version,
            versionNumber: this.versionNumber,
            extend: row.name,
            installExtensionDir: this.installExtensionDir
          })
        )
        IPC.send('app-fork:php', fn, args).then((key, res) => {
          console.log(res)
          if (res.code === 0) {
            IPC.off(key)
            this.taskPhp.extendRunning = false
            if (this.serverRunning) {
              reloadService('php', this.version)
            }
            this.$message.success('操作成功')
            this.getTableData()
            this.toNext()
          } else if (res.code === 1) {
            IPC.off(key)
            this.logs.push(res.msg)
            this.taskPhp.extendRunning = false
            this.showNextBtn = true
            this.$message.error('操作失败')
            this.getTableData()
          } else if (res.code === 200) {
            this.logs.push(res.msg)
          }
        })
      },
      toNext() {
        this.showNextBtn = false
        this.taskPhp.currentExtend = ''
        this.taskPhp.extendAction = ''
      },
      copyLink(index, row) {
        console.log(index, row)
        const pre = row?.extendPre ?? 'extension='
        const txt = `${pre}${row.soPath}`
        clipboard.writeText(txt)
        this.$message.success('扩展链接已复制到剪贴板')
      },
      copyXDebugTmpl(index, row) {
        console.log(index, row)
        const txt = `[xdebug]
;这里给出一个通用模板,需要根据自己修改具体配置项
;适用与xdebug-3.x版本, 2.x版本的请自行修改
zend_extension = "${row.soPath}"
xdebug.idekey = "PHPSTORM"
xdebug.client_host = localhost
;端口ID,phpstorm 设置须一致
xdebug.client_port = 9003
;开启xdebug支持，不同的mode的不同的用途，详细说明请看官方文档
;如果要多个模式一起开启，就用 ',' 分隔开就行
xdebug.mode = debug
xdebug.profiler_append = 0
xdebug.profiler_output_name = cachegrind.out.%p
;这里与原来不同了，原来如果要开启trace或profile,用的是enable_trace,enable_profile等字段
xdebug.start_with_request = yes
;这里就是原来的profile_trigger_value,trace_trigger_value
xdebug.trigger_value=StartProfileForMe
;输出文件路径，原来是output_profiler_dir,trace_dir分别设置,现在统一用这个设置就可以
xdebug.output_dir = /tmp`
        clipboard.writeText(txt)
        this.$message.success('xdebug配置模板已复制到剪贴板')
      }
    }
  }
</script>
