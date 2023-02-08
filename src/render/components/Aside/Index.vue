<template>
  <el-aside width="280px" class="aside">
    <div class="aside-inner">
      <ul class="top-tool">
        <li :class="groupClass" @click="groupDo">
          <yb-icon :svg="import('@/svg/switch.svg?raw')" width="24" height="24" />
        </li>
      </ul>

      <ul class="menu top-menu">
        <li
          v-if="common.showItem.Hosts"
          :class="'non-draggable' + (currentPage === '/host' ? ' active' : '')"
          @click="nav('/host')"
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
          @click="nav('/nginx')"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/nginx.svg?raw')" width="28" height="28" />
            </div>
            <span class="title">Nginx</span>
          </div>

          <el-switch
            :disabled="nginxDisabled"
            :value="nginxRunning"
            @change="switchChange('nginx')"
          >
          </el-switch>
        </li>

        <li
          v-if="common.showItem.Apache"
          :class="'non-draggable' + (currentPage === '/apache' ? ' active' : '')"
          @click="nav('/apache')"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/apache.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Apache</span>
          </div>

          <el-switch
            :disabled="apacheDisabled"
            :value="apacheRunning"
            @change="switchChange('apache')"
          >
          </el-switch>
        </li>

        <li
          v-if="common.showItem.Mysql"
          class="non-draggable"
          :class="'non-draggable' + (currentPage === '/mysql' ? ' active' : '')"
          @click="nav('/mysql')"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/mysql.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Mysql</span>
          </div>

          <el-switch
            :disabled="mysqlDisabled"
            :value="mysqlRunning"
            @change="switchChange('mysql')"
          >
          </el-switch>
        </li>

        <li
          v-if="common.showItem.Php"
          :class="'non-draggable' + (currentPage === '/php' ? ' active' : '')"
          @click="nav('/php')"
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
          @click="nav('/memcached')"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/memcached.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Memcached</span>
          </div>

          <el-switch
            :disabled="memcachedDisabled"
            :value="memcachedRunning"
            @change="switchChange('memcached')"
          >
          </el-switch>
        </li>

        <li
          v-if="common.showItem.Redis"
          :class="'non-draggable' + (currentPage === '/redis' ? ' active' : '')"
          @click="nav('/redis')"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/redis.svg?raw')" width="28" height="28" />
            </div>
            <span class="title">Redis</span>
          </div>

          <el-switch
            :disabled="redisDisabled"
            :value="redisRunning"
            @change="switchChange('redis')"
          >
          </el-switch>
        </li>

        <li
          v-if="common.showItem.NodeJS"
          :class="'non-draggable' + (currentPage === '/node' ? ' active' : '')"
          @click="nav('/node')"
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
          @click="nav('/httpServe')"
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
          @click="nav('/tools')"
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
          @click="nav('/setup')"
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

<script lang="ts">
  import { defineComponent } from 'vue'
  import { startService, stopService } from '@/util/Service'
  import { passwordCheck } from '@/util/Brew'
  import installedVersions from '@/util/InstalledVersions'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import type { TrayState } from '@/tray/store/app'

  export default defineComponent({
    name: 'MoAside',
    components: {},
    data: function () {
      return {
        currentPage: '/host'
      }
    },
    computed: {
      common() {
        return AppStore().config?.setup?.common ?? {}
      },
      nginxVersion() {
        const current = AppStore().config.server?.nginx?.current
        if (!current) {
          return undefined
        }
        const installed = BrewStore()?.nginx?.installed
        return installed?.find((i) => i.path === current?.path && i.version === current?.version)
      },
      mysqlVersion() {
        const current = AppStore().config.server?.mysql?.current
        if (!current) {
          return undefined
        }
        const installed = BrewStore()?.mysql?.installed
        return installed?.find((i) => i.path === current?.path && i.version === current?.version)
      },
      apacheVersion() {
        const current = AppStore().config.server?.apache?.current
        if (!current) {
          return undefined
        }
        const installed = BrewStore()?.apache?.installed
        return installed?.find((i) => i.path === current.path && i.version === current.version)
      },
      memcachedVersion() {
        const current = AppStore().config.server?.memcached?.current
        if (!current) {
          return undefined
        }
        const installed = BrewStore()?.memcached?.installed
        return installed?.find((i) => i.path === current?.path && i.version === current?.version)
      },
      redisVersion() {
        const current = AppStore().config.server?.redis?.current
        if (!current) {
          return undefined
        }
        const installed = BrewStore()?.redis?.installed
        return installed?.find((i) => i.path === current?.path && i.version === current?.version)
      },
      nginxDisabled(): boolean {
        return !this.nginxVersion?.version || BrewStore()?.nginx?.installed?.some((v) => v.running)
      },
      apacheDisabled(): boolean {
        return (
          !this.apacheVersion?.version || BrewStore()?.apache?.installed?.some((v) => v.running)
        )
      },
      mysqlDisabled(): boolean {
        return !this.mysqlVersion?.version || BrewStore()?.mysql?.installed?.some((v) => v.running)
      },
      memcachedDisabled(): boolean {
        return (
          !this.memcachedVersion?.version ||
          BrewStore()?.memcached?.installed?.some((v) => v.running)
        )
      },
      redisDisabled(): boolean {
        return !this.redisVersion?.version || BrewStore()?.redis?.installed?.some((v) => v.running)
      },
      nginxRunning(): boolean {
        return this.nginxVersion?.run === true
      },
      mysqlRunning(): boolean {
        return this.mysqlVersion?.run === true
      },
      apacheRunning(): boolean {
        return this.apacheVersion?.run === true
      },
      memcachedRunning(): boolean {
        return this.memcachedVersion?.run === true
      },
      redisRunning(): boolean {
        return this.redisVersion?.run === true
      },
      phpVersions() {
        return BrewStore()?.php?.installed ?? []
      },
      phpDisable(): boolean {
        return this.phpVersions.length === 0 || this.phpVersions.some((v) => v.running)
      },
      phpRunning: {
        get(): boolean {
          return this.phpVersions.length > 0 && this.phpVersions.some((v) => v.run)
        },
        set(v: boolean) {
          const all: Array<Promise<any>> = []
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
      groupIsRunning(): boolean {
        return (
          this.nginxRunning ||
          this.apacheRunning ||
          this.mysqlRunning ||
          this.phpRunning ||
          this.redisRunning ||
          this.memcachedRunning
        )
      },
      groupDisabled(): boolean {
        const allDisabled =
          this.apacheDisabled &&
          this.memcachedDisabled &&
          this.mysqlDisabled &&
          this.nginxDisabled &&
          this.phpDisable &&
          this.redisDisabled
        const running =
          this?.apacheVersion?.running === true ||
          this?.memcachedVersion?.running === true ||
          this?.mysqlVersion?.running === true ||
          this?.nginxVersion?.running === true ||
          this.phpVersions.some((v) => v.running) ||
          this?.redisVersion?.running === true
        return allDisabled || running
      },
      groupClass(): { [ksy: string]: boolean } {
        return {
          'non-draggable': true,
          'swith-power': true,
          on: this.groupIsRunning,
          disabled: this.groupDisabled
        }
      },
      trayStore(): TrayState {
        return {
          apache: {
            show: this.common.showItem.Apache,
            disabled: this.apacheDisabled,
            run: this.apacheVersion?.run === true,
            running: this.apacheVersion?.running === true
          },
          memcached: {
            show: this.common.showItem.Memcached,
            disabled: this.memcachedDisabled,
            run: this.memcachedVersion?.run === true,
            running: this.memcachedVersion?.running === true
          },
          mysql: {
            show: this.common.showItem.Mysql,
            disabled: this.mysqlDisabled,
            run: this.mysqlVersion?.run === true,
            running: this.mysqlVersion?.running === true
          },
          nginx: {
            show: this.common.showItem.Nginx,
            disabled: this.nginxDisabled,
            run: this.nginxVersion?.run === true,
            running: this.nginxVersion?.running === true
          },
          password: AppStore()?.config?.password,
          php: {
            show: this.common.showItem.Php,
            disabled: this.phpDisable,
            run: this.phpRunning === true,
            running: this.phpVersions.some((v) => v.running)
          },
          redis: {
            show: this.common.showItem.Redis,
            disabled: this.redisDisabled,
            run: this.redisVersion?.run === true,
            running: this.redisVersion?.running === true
          }
        }
      }
    },
    watch: {
      server: {
        handler(v) {
          console.log('watch server: ', v)
        },
        deep: true
      },
      groupIsRunning(val) {
        IPC.send('Application:tray-status-change', val).then((key: string) => {
          IPC.off(key)
        })
      },
      trayStore: {
        handler(v) {
          IPC.send('APP:Tray-Store-Sync', JSON.parse(JSON.stringify(v))).then((key: string) => {
            IPC.off(key)
          })
        },
        deep: true
      }
    },
    created() {
      installedVersions.allInstalledVersions('php')
      installedVersions.allInstalledVersions('nginx')
      installedVersions.allInstalledVersions('mysql')
      installedVersions.allInstalledVersions('apache')
      installedVersions.allInstalledVersions('memcached')
      installedVersions.allInstalledVersions('redis')
      IPC.on('APP:Tray-Command').then((key: string, fn: string, arg: any) => {
        console.log('on APP:Tray-Command', key, fn, arg)
        if (fn === 'switchChange' && arg === 'php') {
          this.phpRunning = !this.phpRunning
          return
        }
        // @ts-ignore
        this?.[fn] && this[fn](arg)
      })
    },
    mounted() {},
    methods: {
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
                let find = res.find((s: boolean | string) => typeof s === 'string')
                if (find) {
                  this.$message.error(find as string)
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
      switchChange(flag: string) {
        passwordCheck().then(() => {
          let fn = null
          let promise: Promise<any> | null = null
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
          promise?.then((res) => {
            if (typeof res === 'string') {
              this.$message.error(res)
            } else {
              this.$message.success('操作成功')
            }
          })
        })
      },
      nav(page: string) {
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
  })
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
