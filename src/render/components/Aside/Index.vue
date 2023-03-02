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
          v-if="showItem.Hosts"
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
          v-if="showItem.Nginx"
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
          v-if="showItem.Apache"
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
          v-if="showItem.Mysql"
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
          v-if="showItem.Php"
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
          v-if="showItem.Memcached"
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
          v-if="showItem.Redis"
          :class="'non-draggable' + (currentPage === '/redis' ? ' active' : '')"
          @click="nav('/redis')"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon
                style="padding: 7px"
                :svg="import('@/svg/redis.svg?raw')"
                width="28"
                height="28"
              />
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
          v-if="showItem.MongoDB"
          class="non-draggable"
          :class="'non-draggable' + (currentPage === '/mongodb' ? ' active' : '')"
          @click="nav('/mongodb')"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon
                style="padding: 5px"
                :svg="import('@/svg/MongoDB.svg?raw')"
                width="30"
                height="30"
              />
            </div>
            <span class="title">MongoDB</span>
          </div>

          <el-switch
            :disabled="mongodbDisabled"
            :value="mongodbRunning"
            @change="switchChange('mongodb')"
          >
          </el-switch>
        </li>

        <li
          v-if="showItem.NodeJS"
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
          v-if="showItem.HttpServe"
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
          v-if="showItem.Tools"
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
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import type { TrayState } from '@/tray/store/app'
  let lastTray = ''
  export default defineComponent({
    name: 'MoAside',
    components: {},
    data: function () {
      return {
        currentPage: '/host'
      }
    },
    computed: {
      showItem() {
        return AppStore().config.setup.common.showItem
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
      mongodbVersion() {
        const current = AppStore().config.server?.mongodb?.current
        if (!current) {
          return undefined
        }
        const installed = BrewStore()?.mongodb?.installed
        return installed?.find((i) => i.path === current?.path && i.version === current?.version)
      },
      nginxDisabled(): boolean {
        return (
          !this.nginxVersion?.version ||
          BrewStore()?.nginx?.installed?.some((v) => v.running) ||
          !AppStore().versionInited
        )
      },
      apacheDisabled(): boolean {
        return (
          !this.apacheVersion?.version ||
          BrewStore()?.apache?.installed?.some((v) => v.running) ||
          !AppStore().versionInited
        )
      },
      mysqlDisabled(): boolean {
        return (
          !this.mysqlVersion?.version ||
          BrewStore()?.mysql?.installed?.some((v) => v.running) ||
          !AppStore().versionInited
        )
      },
      memcachedDisabled(): boolean {
        return (
          !this.memcachedVersion?.version ||
          BrewStore()?.memcached?.installed?.some((v) => v.running) ||
          !AppStore().versionInited
        )
      },
      redisDisabled(): boolean {
        return (
          !this.redisVersion?.version ||
          BrewStore()?.redis?.installed?.some((v) => v.running) ||
          !AppStore().versionInited
        )
      },
      mongodbDisabled(): boolean {
        return (
          !this.mongodbVersion?.version ||
          BrewStore()?.mongodb?.installed?.some((v) => v.running) ||
          !AppStore().versionInited
        )
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
      mongodbRunning(): boolean {
        return this.mongodbVersion?.run === true
      },
      phpVersions() {
        return BrewStore()?.php?.installed ?? []
      },
      phpDisable(): boolean {
        return (
          this.phpVersions.length === 0 ||
          this.phpVersions.some((v) => v.running) ||
          !AppStore().versionInited
        )
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
              this.$message.success(this.$t('base.success'))
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
          this.memcachedRunning ||
          this.mongodbRunning
        )
      },
      groupDisabled(): boolean {
        const allDisabled =
          this.apacheDisabled &&
          this.memcachedDisabled &&
          this.mysqlDisabled &&
          this.nginxDisabled &&
          this.phpDisable &&
          this.redisDisabled &&
          this.mongodbDisabled
        const running =
          this?.apacheVersion?.running === true ||
          this?.memcachedVersion?.running === true ||
          this?.mysqlVersion?.running === true ||
          this?.nginxVersion?.running === true ||
          this.phpVersions.some((v) => v.running) ||
          this?.redisVersion?.running === true ||
          this?.mongodbVersion?.running === true
        return allDisabled || running || !AppStore().versionInited
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
        const appStore = AppStore()
        return {
          apache: {
            show: this.showItem.Apache,
            disabled: this.apacheDisabled,
            run: this.apacheVersion?.run === true,
            running: this.apacheVersion?.running === true
          },
          memcached: {
            show: this.showItem.Memcached,
            disabled: this.memcachedDisabled,
            run: this.memcachedVersion?.run === true,
            running: this.memcachedVersion?.running === true
          },
          mysql: {
            show: this.showItem.Mysql,
            disabled: this.mysqlDisabled,
            run: this.mysqlVersion?.run === true,
            running: this.mysqlVersion?.running === true
          },
          nginx: {
            show: this.showItem.Nginx,
            disabled: this.nginxDisabled,
            run: this.nginxVersion?.run === true,
            running: this.nginxVersion?.running === true
          },
          password: appStore?.config?.password,
          lang: appStore?.config?.setup?.lang,
          php: {
            show: this.showItem.Php,
            disabled: this.phpDisable,
            run: this.phpRunning === true,
            running: this.phpVersions.some((v) => v.running)
          },
          redis: {
            show: this.showItem.Redis,
            disabled: this.redisDisabled,
            run: this.redisVersion?.run === true,
            running: this.redisVersion?.running === true
          },
          mongodb: {
            show: this.showItem.MongoDB,
            disabled: this.mongodbDisabled,
            run: this.mongodbVersion?.run === true,
            running: this.mongodbVersion?.running === true
          },
          groupDisabled: this.groupDisabled,
          groupIsRunning: this.groupIsRunning
        }
      }
    },
    watch: {
      groupIsRunning(val) {
        IPC.send('Application:tray-status-change', val).then((key: string) => {
          IPC.off(key)
        })
      },
      trayStore: {
        handler(v) {
          const current = JSON.stringify(v)
          if (lastTray !== current) {
            lastTray = current
            console.log('trayStore changed: ', current)
            IPC.send('APP:Tray-Store-Sync', JSON.parse(current)).then((key: string) => {
              IPC.off(key)
            })
          }
        },
        immediate: true,
        deep: true
      }
    },
    created() {
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
            if (this.showItem.Nginx && this.nginxRunning && this.nginxVersion?.version) {
              all.push(stopService('nginx', this.nginxVersion))
            }
            if (this.showItem.Apache && this.apacheRunning && this.apacheVersion?.version) {
              all.push(stopService('apache', this.apacheVersion))
            }
            if (this.showItem.Mysql && this.mysqlRunning && this.mysqlVersion?.version) {
              all.push(stopService('mysql', this.mysqlVersion))
            }
            if (
              this.showItem.Memcached &&
              this.memcachedRunning &&
              this.memcachedVersion?.version
            ) {
              all.push(stopService('memcached', this.memcachedVersion))
            }
            if (this.showItem.Redis && this.redisRunning && this.redisVersion?.version) {
              all.push(stopService('redis', this.redisVersion))
            }
            if (this.showItem.MongoDB && this.mongodbRunning && this.mongodbVersion?.version) {
              all.push(stopService('mongodb', this.mongodbVersion))
            }
            this.phpVersions.forEach((v) => {
              all.push(stopService('php', v))
            })
          } else {
            if (this.showItem.Nginx && this.nginxVersion?.version) {
              all.push(startService('nginx', this.nginxVersion))
            }
            if (this.showItem.Apache && this.apacheVersion?.version) {
              all.push(startService('apache', this.apacheVersion))
            }
            if (this.showItem.Mysql && this.mysqlVersion?.version) {
              all.push(startService('mysql', this.mysqlVersion))
            }
            if (this.showItem.Memcached && this.memcachedVersion?.version) {
              all.push(startService('memcached', this.memcachedVersion))
            }
            if (this.showItem.Redis && this.redisVersion?.version) {
              all.push(startService('redis', this.redisVersion))
            }
            if (this.showItem.MongoDB && this.mongodbVersion?.version) {
              all.push(startService('mongodb', this.mongodbVersion))
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
                  this.$message.success(this.$t('base.success'))
                }
              })
              .catch(() => {
                this.$message.error(this.$t('base.fail'))
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
            case 'mongodb':
              if (!this.mongodbVersion?.version) return
              fn = this.mongodbRunning ? stopService : startService
              promise = fn('mongodb', this.mongodbVersion)
              break
          }
          promise?.then((res) => {
            if (typeof res === 'string') {
              this.$message.error(res)
            } else {
              this.$message.success(this.$t('base.success'))
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
