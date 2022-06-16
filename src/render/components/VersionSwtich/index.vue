<template>
  <div class="redis-versions">
    <div class="block">
      <span>选择版本</span>
      <el-select v-model="current" :disabled="disabled" placeholder="请选择" class="ml-30">
        <el-option
          v-for="(item, index) in versions"
          :key="index"
          :label="item.version + ' - ' + item.path"
          :value="item.version + ' - ' + item.path"
        >
        </el-option>
      </el-select>
      <el-button
        :disabled="disabled || current === currentVersion"
        class="ml-20"
        :loading="currentTask.running"
        @click="versionChange"
        >切换</el-button
      >
      <el-button :disabled="initing" class="ml-20" :loading="initing" @click="reinit"
        >刷新</el-button
      >
    </div>

    <ul id="logs" class="logs">
      <li v-for="(txt, index) in log" :key="index" class="mb-5" v-html="txt"></li>
    </ul>
  </div>
</template>

<script>
  import { getSubDir } from '@shared/file.js'
  import { mapGetters } from 'vuex'
  import IPC from '@/util/IPC.js'
  import { AppMixins } from '@/mixins/AppMixins.js'

  const { join } = require('path')
  const { existsSync, realpathSync } = require('fs')

  export default {
    components: {},
    mixins: [AppMixins],
    props: {
      typeFlag: {
        type: String,
        default: ''
      }
    },
    data() {
      return {
        current: '',
        initing: false,
        searchNames: {
          apache: 'httpd',
          nginx: 'nginx',
          php: 'php',
          mysql: 'mysql',
          memcached: 'memcached',
          redis: 'redis'
        },
        binNames: {
          apache: 'apachectl',
          nginx: 'nginx',
          php: 'php-fpm',
          mysql: 'mysqld_safe',
          memcached: 'memcached',
          redis: 'redis-server'
        }
      }
    },
    computed: {
      ...mapGetters('brew', {
        brewRunning: 'brewRunning',
        apache: 'apache',
        nginx: 'nginx',
        php: 'php',
        memcached: 'memcached',
        mysql: 'mysql',
        redis: 'redis'
      }),
      ...mapGetters('task', {
        taskApache: 'apache',
        taskNginx: 'nginx',
        taskPhp: 'php',
        taskMemcached: 'memcached',
        taskMysql: 'mysql',
        taskRedis: 'redis'
      }),
      ...mapGetters('app', {
        stat: 'stat',
        setup: 'setup'
      }),
      customDirs() {
        return this.setup[this.typeFlag].dirs
      },
      currentTask() {
        const dict = {
          apache: this.taskApache,
          nginx: this.taskNginx,
          php: this.taskPhp,
          memcached: this.taskMemcached,
          mysql: this.taskMysql,
          redis: this.taskRedis
        }
        return dict[this.typeFlag]
      },
      disabled() {
        return this.brewRunning || this.currentTask.running
      },
      log() {
        return this.currentTask.log
      },
      logLength() {
        return this.log.length
      },
      versions() {
        return this[this.typeFlag].installed
      },
      currentVersion() {
        if (this.server?.[this.typeFlag]?.current?.version) {
          const v = this.server[this.typeFlag].current.version
          const p = this.server[this.typeFlag].current.path
          return `${v} - ${p}`
        }
        return ''
      }
    },
    watch: {
      logLength() {
        this.$nextTick(() => {
          let container = this.$el.querySelector('#logs')
          if (container) {
            container.scrollTop = container.scrollHeight
          }
        })
      }
    },
    created: function () {
      if (!this.currentTask.running) {
        this.log.splice(0)
      }
      this.getCurrenVersion()
      this.init()
    },
    methods: {
      reinit() {
        const data = this[this.typeFlag]
        data.installedInited = false
        this.init()
      },
      init() {
        if (this.initing) {
          return
        }
        this.getInstalled()
      },
      getInstalled() {
        const data = this[this.typeFlag]
        if (!data.installedInited) {
          this.initing = true
          data.installed.splice(0)
          const searchName = this.searchNames[this.typeFlag]
          const installed = new Set()
          const systemDirs = ['/', '/opt', '/usr']
          systemDirs.forEach((s) => {
            const bin = this.findInstalled(s, 0, 1)
            if (bin) {
              installed.add(bin)
            }
          })

          const base = global.Server?.BrewCellar ?? ''
          if (base) {
            getSubDir(base)
              .filter((f) => {
                return f.includes(searchName)
              })
              .forEach((f) => {
                getSubDir(f).forEach((s) => {
                  const bin = this.findInstalled(s)
                  if (bin) {
                    installed.add(bin)
                  }
                })
              })
          }

          this.customDirs.forEach((s) => {
            const bin = this.findInstalled(s, 0, 1)
            if (bin) {
              installed.add(bin)
            }
          })
          console.log('installed: ', installed)
          const binName = this.binNames[this.typeFlag]
          const count = installed.size
          let index = 0
          installed.forEach((i) => {
            const path = i.replace(`/sbin/${binName}`, '').replace(`/bin/${binName}`, '')
            IPC.send('app-fork:brew', 'binVersion', i, binName).then((key, res) => {
              IPC.off(key)
              if (res?.version) {
                data.installed.push({
                  version: res.version,
                  bin: i,
                  path: `${path}/`
                })
              }
              index += 1
              if (index === count) {
                this.initing = false
                data.installedInited = true
              }
            })
          })
        }
      },
      findInstalled(dir, depth = 0, maxDepth = 2) {
        let res = false
        const binName = this.binNames[this.typeFlag]
        let binPath = join(dir, `bin/${binName}`)
        if (existsSync(binPath)) {
          return realpathSync(binPath)
        }
        binPath = join(dir, `sbin/${binName}`)
        if (existsSync(binPath)) {
          return realpathSync(binPath)
        }
        if (depth >= maxDepth) {
          return res
        }
        const sub = getSubDir(dir)
        sub.forEach((s) => {
          res = res || this.findInstalled(s, depth + 1, maxDepth)
        })
        return res
      },
      getCurrenVersion() {
        this.current = this.currentVersion
      },
      versionChange() {
        if (this.current === this.currentVersion) {
          return
        }
        this.log.splice(0)
        this.currentTask.running = true
        let data = null
        this.versions.some((v) => {
          const txt = `${v.version} - ${v.path}`
          if (txt === this.current) {
            data = v
            return true
          }
          return false
        })
        IPC.send(
          `app-fork:${this.typeFlag}`,
          'switchVersion',
          JSON.parse(JSON.stringify(data))
        ).then((key, res) => {
          if (res.code === 0) {
            IPC.off(key)
            this.server[this.typeFlag].current = res.version
            this.$store.dispatch('app/saveConfig').then()
            this.stat[this.typeFlag] = true
            this.$message.success('操作成功')
            this.currentTask.running = false
          } else if (res.code === 1) {
            IPC.off(key)
            this.$message.error('操作失败')
            this.currentTask.running = false
          } else if (res.code === 200) {
            this.log.push(res.msg)
          }
          console.log('res: ', res)
        })
      }
    }
  }
</script>

<style lang="scss">
  .redis-versions {
    display: flex;
    flex-direction: column;
    height: 100%;
    .block {
      display: flex;
      align-items: center;
      margin: 40px 0 30px 40px;
      flex-shrink: 0;
    }
    .logs {
      padding-left: 40px;
      flex: 1;
      width: 100%;
      display: flex;
      flex-direction: column;
      overflow: auto;
      > li {
        width: 100%;
        word-break: break-word;
      }
    }
  }
</style>
