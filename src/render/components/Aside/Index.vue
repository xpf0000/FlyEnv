<template>
  <el-aside width="280px" :class="['aside', 'hidden-sm-and-down', { draggable: asideDraggable }]">
    <div class="aside-inner">
      <ul class="top-tool">
        <li
          :class="{
            'non-draggable': true,
            'swith-power': true,
            on: groupIsRunning,
            disabled: groupDisabled
          }"
          @click="groupDo"
        >
          <yb-icon :svg="import('@/svg/switch.svg?raw')" width="24" height="24" />
        </li>
      </ul>

      <ul class="menu top-menu">
        <li
          v-if="common.showItem.Hosts"
          v-tour="{
            position: 'bottom',
            group: 'custom',
            index: 4,
            count: 7,
            title: '使用指引',
            component: Step5,
            onPre: onStep5Pre,
            onNext: onStep5Next
          }"
          :class="'non-draggable' + (currentPage === '/host' ? ' active' : '')"
          @click="nav('/host', $event)"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/host.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Hosts</span>
          </div>
        </li>

        <li
          v-if="common.showItem.Nginx"
          :class="'non-draggable' + (currentPage === '/nginx' ? ' active' : '')"
          @click="nav('/nginx', $event)"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/nginx.svg?raw')" width="28" height="28" />
            </div>
            <span class="title">Nginx</span>
          </div>

          <el-switch
            :disabled="!nginxVersion?.version || nginxVersion?.running"
            :value="nginxRunning"
            @change="switchChange('nginx')"
          >
          </el-switch>
        </li>

        <li
          v-if="common.showItem.Apache"
          :class="'non-draggable' + (currentPage === '/apache' ? ' active' : '')"
          @click="nav('/apache', $event)"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/apache.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Apache</span>
          </div>

          <el-switch
            :disabled="!apacheVersion?.version || apacheVersion?.running"
            :value="apacheRunning"
            @change="switchChange('apache')"
          >
          </el-switch>
        </li>

        <li
          v-if="common.showItem.Mysql"
          class="non-draggable"
          :class="'non-draggable' + (currentPage === '/mysql' ? ' active' : '')"
          @click="nav('/mysql', $event)"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/mysql.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Mysql</span>
          </div>

          <el-switch
            :disabled="!mysqlVersion?.version || mysqlVersion?.running"
            :value="mysqlRunning"
            @change="switchChange('mysql')"
          >
          </el-switch>
        </li>

        <li
          v-if="common.showItem.Php"
          v-tour="{
            position: 'right',
            group: 'custom',
            index: 0,
            count: 7,
            title: '使用指引',
            component: Step1,
            onNext: onStep0Next,
            onShow: onStep0Show
          }"
          :class="'non-draggable' + (currentPage === '/php' ? ' active' : '')"
          @click="nav('/php', $event)"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/php.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Php</span>
          </div>

          <el-switch v-model="phpRunning" :disabled="phpDisable"> </el-switch>
        </li>

        <li
          v-if="common.showItem.Memcached"
          :class="'non-draggable' + (currentPage === '/memcached' ? ' active' : '')"
          @click="nav('/memcached', $event)"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/memcached.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Memcached</span>
          </div>

          <el-switch
            :disabled="!memcachedVersion?.version || memcachedVersion?.running"
            :value="memcachedRunning"
            @change="switchChange('memcached')"
          >
          </el-switch>
        </li>

        <li
          v-if="common.showItem.Redis"
          :class="'non-draggable' + (currentPage === '/redis' ? ' active' : '')"
          @click="nav('/redis', $event)"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/redis.svg?raw')" width="28" height="28" />
            </div>
            <span class="title">Redis</span>
          </div>

          <el-switch
            :disabled="!redisVersion?.version || redisVersion?.running"
            :value="redisRunning"
            @change="switchChange('redis')"
          >
          </el-switch>
        </li>

        <li
          v-if="common.showItem.NodeJS"
          :class="'non-draggable' + (currentPage === '/node' ? ' active' : '')"
          @click="nav('/node', $event)"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/nodejs.svg?raw')" width="28" height="28" />
            </div>
            <span class="title">NodeJS</span>
          </div>
        </li>

        <li
          v-if="common.showItem.HttpServe"
          :class="'non-draggable' + (currentPage === '/httpServe' ? ' active' : '')"
          @click="nav('/httpServe', $event)"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon
                style="padding: 4.5px"
                :svg="import('@/svg/http.svg?raw')"
                width="28"
                height="28"
              />
            </div>
            <span class="title">Http Serve</span>
          </div>
        </li>

        <li
          v-if="common.showItem.Tools"
          :class="'non-draggable' + (currentPage === '/tools' ? ' active' : '')"
          @click="nav('/tools', $event)"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/tool.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Tools</span>
          </div>
        </li>
      </ul>
      <ul class="menu setup-menu">
        <li
          :class="'non-draggable' + (currentPage === '/setup' ? ' active' : '')"
          @click="nav('/setup', $event)"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/setup.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Setup</span>
          </div>
        </li>
      </ul>
    </div>
  </el-aside>
</template>

<script>
  import { markRaw, nextTick, toRaw } from 'vue'
  import { mapGetters } from 'vuex'
  import { startService, stopService } from '@/util/Service.js'
  import { EventBus } from '@/global.js'
  import Step1 from '@/components/Tour/Step1.vue'
  import Step5 from '@/components/Tour/Step5.vue'
  import { TourCenter } from '@/core/directive/Tour/index.ts'
  import { passwordCheck } from '@/util/Brew.js'
  import installedVersions from '@/util/InstalledVersions.js'

  const is = require('electron-is')
  export default {
    name: 'MoAside',
    components: {},
    data: function () {
      return {
        currentPage: '/host',
        Step1: markRaw(toRaw(Step1)),
        Step5: markRaw(toRaw(Step5))
      }
    },
    computed: {
      ...mapGetters('app', {
        config: 'config',
        server: 'server'
      }),
      common() {
        return this.config?.setup?.common ?? {}
      },
      ...mapGetters('brew', {
        php: 'php',
        nginx: 'nginx',
        apache: 'apache',
        memcached: 'memcached',
        mysql: 'mysql',
        redis: 'redis'
      }),
      nginxVersion() {
        const current = this.server?.nginx?.current
        if (!current) {
          return undefined
        }
        const installed = this?.nginx?.installed
        return installed?.find((i) => i.path === current?.path && i.version === current?.version)
      },
      mysqlVersion() {
        const current = this.server?.mysql?.current
        if (!current) {
          return undefined
        }
        const installed = this?.mysql?.installed
        return installed?.find((i) => i.path === current?.path && i.version === current?.version)
      },
      apacheVersion() {
        const current = this.server?.apache?.current
        if (!current) {
          return undefined
        }
        console.log('apacheVersion: ', current)
        const installed = this?.apache?.installed
        return installed?.find((i) => i.path === current?.path && i.version === current?.version)
      },
      memcachedVersion() {
        const current = this.server?.memcached?.current
        if (!current) {
          return undefined
        }
        const installed = this?.memcached?.installed
        return installed?.find((i) => i.path === current?.path && i.version === current?.version)
      },
      redisVersion() {
        const current = this.server?.redis?.current
        if (!current) {
          return undefined
        }
        const installed = this?.redis?.installed
        return installed?.find((i) => i.path === current?.path && i.version === current?.version)
      },
      nginxRunning() {
        return this.nginxVersion?.run
      },
      mysqlRunning() {
        return this.mysqlVersion?.run
      },
      apacheRunning() {
        return this.apacheVersion?.run
      },
      memcachedRunning() {
        return this.memcachedVersion?.run
      },
      redisRunning() {
        return this.redisVersion?.run
      },
      phpVersions() {
        return this?.php?.installed ?? []
      },
      phpDisable() {
        return this.phpVersions.length === 0 || this.phpVersions.some((v) => v.running)
      },
      phpRunning: {
        get() {
          return this.phpVersions.length > 0 && this.phpVersions.some((v) => v.run)
        },
        set(v) {
          const all = []
          if (v) {
            this.phpVersions.forEach((v) => {
              all.push(startService('php', v))
            })
          } else {
            this.phpVersions.forEach((v) => {
              all.push(stopService('php', v))
            })
          }
          Promise.all(all).then((res) => {
            let find = res.find((s) => typeof s === 'string')
            if (find) {
              this.$message.error(find)
            } else {
              this.$message.success('操作成功')
            }
          })
        }
      },
      groupIsRunning() {
        return (
          this.nginxRunning ||
          this.apacheRunning ||
          this.mysqlRunning ||
          this.phpRunning ||
          this.redisRunning ||
          this.memcachedRunning
        )
      },
      asideDraggable: function () {
        return is.macOS()
      },
      groupDisabled() {
        const a =
          this.nginxVersion?.version ||
          this.mysqlVersion?.version ||
          this.apacheVersion?.version ||
          this.memcachedVersion?.version ||
          this.redisVersion?.version ||
          this.phpVersions.length > 0
        const isPhpTasking = this.phpVersions.some((v) => v.running)
        return (
          !a ||
          this.apacheVersion?.running ||
          this.nginxVersion?.running ||
          isPhpTasking ||
          this.memcachedVersion?.running ||
          this.mysqlVersion?.running ||
          this.redisVersion?.running
        )
      }
    },
    watch: {
      currentPage() {
        console.log('currentPage : ', this.currentPage)
      }
    },
    created() {
      EventBus.on('TourStep', this.onTourStep)
      installedVersions.allInstalledVersions('php')
      installedVersions.allInstalledVersions('nginx')
      installedVersions.allInstalledVersions('mysql')
      installedVersions.allInstalledVersions('apache')
      installedVersions.allInstalledVersions('memcached')
      installedVersions.allInstalledVersions('redis')
    },
    methods: {
      onTourStep(step) {
        switch (step) {
          case 0:
            this.nav('/php')
            break
          case 4:
            this.nav('/host')
            break
          case 6:
            this.nav('/setup').then(() => {
              nextTick().then(() => {
                TourCenter.poper.style.opacity = 1.0
              })
            })
            break
          case 7:
            this.nav('/host').then(() => {
              nextTick().then(() => {
                EventBus.emit('TourStep', 5)
              })
            })
            break
          case 8:
            this.nav('/host').then(() => {
              nextTick().then(() => {
                EventBus.emit('vue:need-password')
              })
            })
            break
        }
      },
      onStep0Next() {
        return new Promise((resolve) => {
          EventBus.emit('TourStep', 1)
          resolve(true)
        })
      },
      onStep0Show() {
        return new Promise((resolve) => {
          this.onTourStep(0)
          resolve(true)
        })
      },
      onStep5Pre() {
        return new Promise((resolve) => {
          this.onTourStep(0)
          resolve(true)
        })
      },
      onStep5Next() {
        return new Promise((resolve) => {
          EventBus.emit('TourStep', 5)
          TourCenter.poper.style.opacity = 0.0
          resolve(true)
        })
      },
      groupDo() {
        if (this.groupDisabled) {
          return
        }
        passwordCheck().then(() => {
          const all = []
          if (this.groupIsRunning) {
            if (this.common.showItem.Nginx && this.nginxRunning && this.nginxVersion?.version) {
              all.push(stopService('nginx', this.nginxVersion))
            }
            if (this.common.showItem.Apache && this.apacheRunning && this.apacheVersion?.version) {
              all.push(stopService('apache', this.apacheVersion))
            }
            if (this.common.showItem.Mysql && this.mysqlRunning && this.mysqlVersion?.version) {
              all.push(stopService('mysql', this.mysqlVersion))
            }
            if (
              this.common.showItem.Memcached &&
              this.memcachedRunning &&
              this.memcachedVersion?.version
            ) {
              all.push(stopService('memcached', this.memcachedVersion))
            }
            if (this.common.showItem.Redis && this.redisRunning && this.redisVersion?.version) {
              all.push(stopService('redis', this.redisVersion))
            }
            this.phpVersions.forEach((v) => {
              all.push(stopService('php', v))
            })
          } else {
            if (this.common.showItem.Nginx && this.nginxVersion?.version) {
              all.push(startService('nginx', this.nginxVersion))
            }
            if (this.common.showItem.Apache && this.apacheVersion?.version) {
              all.push(startService('apache', this.apacheVersion))
            }
            if (this.common.showItem.Mysql && this.mysqlVersion?.version) {
              all.push(startService('mysql', this.mysqlVersion))
            }
            if (this.common.showItem.Memcached && this.memcachedVersion?.version) {
              all.push(startService('memcached', this.memcachedVersion))
            }
            if (this.common.showItem.Redis && this.redisVersion?.version) {
              all.push(startService('redis', this.redisVersion))
            }
            this.phpVersions.forEach((v) => {
              all.push(startService('php', v))
            })
          }
          if (all.length > 0) {
            Promise.all(all)
              .then((res) => {
                let find = res.find((s) => typeof s === 'string')
                if (find) {
                  this.$message.error(find)
                } else {
                  this.$message.success('操作成功')
                }
              })
              .catch(() => {
                this.$message.error('操作失败')
              })
          }
        })
      },
      switchChange(flag) {
        passwordCheck().then(() => {
          let fn = null
          let promise = null
          switch (flag) {
            case 'nginx':
              if (!this.nginxVersion?.version) return
              fn = this.nginxRunning ? stopService : startService
              promise = fn('nginx', this.nginxVersion)
              break
            case 'mysql':
              if (!this.mysqlVersion?.version) return
              fn = this.mysqlRunning ? stopService : startService
              promise = fn('mysql', this.mysqlVersion)
              break
            case 'apache':
              if (!this.apacheVersion?.version) return
              fn = this.apacheRunning ? stopService : startService
              promise = fn('apache', this.apacheVersion)
              break
            case 'memcached':
              if (!this.memcachedVersion?.version) return
              fn = this.memcachedRunning ? stopService : startService
              promise = fn('memcached', this.memcachedVersion)
              break
            case 'redis':
              if (!this.redisVersion?.version) return
              fn = this.redisRunning ? stopService : startService
              promise = fn('redis', this.redisVersion)
              break
          }
          promise.then((res) => {
            if (typeof res === 'string') {
              this.$message.error(res)
            } else {
              this.$message.success('操作成功')
            }
          })
        })
      },
      nav(page) {
        return new Promise((resolve) => {
          if (this.currentPage === page) {
            resolve(true)
          }
          this.$router
            .push({
              path: page
            })
            .then(() => {
              resolve(true)
            })
            .catch((err) => {
              console.log('router err: ', err)
              resolve(true)
            })
          this.currentPage = page
        })
      }
    }
  }
</script>

<style lang="scss">
  .aside-inner {
    display: flex;
    height: 100%;
    flex-flow: column;
    > .top-tool {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 55px 20px 12px 20px;
      list-style: none;
      > li {
        width: 30px;
        height: 30px;
        cursor: pointer;
        border-radius: 14px;
        transition: background-color 0.25s;
        display: flex;
        justify-content: center;
        align-items: center;
        &:hover {
          background-color: rgba(255, 255, 255, 0.15);
        }
      }
    }
  }
  .logo-mini {
    margin-top: 40px;
  }
  .menu {
    width: 100%;
    padding: 0;
    margin: 0 auto;
    user-select: none;
    cursor: default;
    > li {
      height: 45px;
      cursor: pointer;
      transition: background-color 0.25s;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 20px;
      &:hover {
        background-color: #3e4257;
      }
      &.active {
        color: #fff;
        background-color: #1d2033;
      }
      .left {
        height: 100%;
        display: flex;
        align-items: center;
        .icon-block {
          width: 38px;
          height: 45px;
          display: flex;
          align-items: center;
        }
        .title {
          font-size: 14px;
        }
      }
    }
    svg {
      padding: 6px;
      color: #fff;
    }
  }
  .top-menu {
    flex: 1;
  }
  .setup-menu {
    flex-shrink: 0;
  }
  .bottom-menu {
    margin-bottom: 24px;
  }
</style>
