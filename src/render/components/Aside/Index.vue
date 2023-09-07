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
          v-if="showItem.mariadb"
          class="non-draggable"
          :class="'non-draggable' + (currentPage === '/mariadb' ? ' active' : '')"
          @click="nav('/mariadb')"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/mariaDB.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">MariaDB</span>
          </div>

          <el-switch
            :disabled="mariaDBDisabled"
            :value="mariaDBRunning"
            @change="switchChange('mariadb')"
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
          v-if="showItem.DNS"
          class="non-draggable"
          :class="'non-draggable' + (currentPage === '/dns' ? ' active' : '')"
          @click="nav('/dns')"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon
                style="padding: 5px"
                :svg="import('@/svg/dns2.svg?raw')"
                width="30"
                height="30"
              />
            </div>
            <span class="title">DNS Server</span>
          </div>

          <el-switch
            :loading="dnsServerFetching"
            :disabled="dnsServerFetching"
            :value="dnsServerRunning"
            @change="switchChange('dns')"
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

<script lang="ts" setup>
  import { ref, computed, watch } from 'vue'
  import { startService, stopService, dnsStart, dnsStop } from '@/util/Service'
  import { passwordCheck } from '@/util/Brew'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { DnsStore } from '@/store/dns'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'
  import Router from '@/router/index'
  let lastTray = ''

  const appStore = AppStore()
  const brewStore = BrewStore()
  const dnsStore = DnsStore()
  const currentPage = ref('/host')

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const nginxVersion = computed(() => {
    const current = appStore.config.server?.nginx?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.nginx?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const mysqlVersion = computed(() => {
    const current = appStore.config.server?.mysql?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.mysql?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const mariaDBVersion = computed(() => {
    const current = appStore.config.server?.mariadb?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.mariadb?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const apacheVersion = computed(() => {
    const current = appStore.config.server?.apache?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.apache?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const memcachedVersion = computed(() => {
    const current = appStore.config.server?.memcached?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.memcached?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const redisVersion = computed(() => {
    const current = appStore.config.server?.redis?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.redis?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const mongodbVersion = computed(() => {
    const current = appStore.config.server?.mongodb?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.mongodb?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const nginxDisabled = computed(() => {
    return (
      !nginxVersion?.value?.version ||
      brewStore?.nginx?.installed?.some((v) => v.running) ||
      !appStore.versionInited
    )
  })

  const apacheDisabled = computed(() => {
    return (
      !apacheVersion?.value?.version ||
      brewStore?.apache?.installed?.some((v) => v.running) ||
      !appStore.versionInited
    )
  })

  const mysqlDisabled = computed(() => {
    return (
      !mysqlVersion?.value?.version ||
      brewStore?.mysql?.installed?.some((v) => v.running) ||
      !appStore.versionInited
    )
  })

  const mariaDBDisabled = computed(() => {
    return (
      !mariaDBVersion?.value?.version ||
      brewStore?.mariadb?.installed?.some((v) => v.running) ||
      !appStore.versionInited
    )
  })

  const memcachedDisabled = computed(() => {
    return (
      !memcachedVersion?.value?.version ||
      brewStore?.memcached?.installed?.some((v) => v.running) ||
      !appStore.versionInited
    )
  })

  const redisDisabled = computed(() => {
    return (
      !redisVersion?.value?.version ||
      brewStore?.redis?.installed?.some((v) => v.running) ||
      !appStore.versionInited
    )
  })

  const mongodbDisabled = computed(() => {
    return (
      !mongodbVersion?.value?.version ||
      brewStore?.mongodb?.installed?.some((v) => v.running) ||
      !appStore.versionInited
    )
  })

  const nginxRunning = computed(() => {
    return nginxVersion?.value?.run === true
  })

  const mysqlRunning = computed(() => {
    return mysqlVersion?.value?.run === true
  })

  const mariaDBRunning = computed(() => {
    return mariaDBVersion?.value?.run === true
  })

  const apacheRunning = computed(() => {
    return apacheVersion?.value?.run === true
  })

  const memcachedRunning = computed(() => {
    return memcachedVersion?.value?.run === true
  })

  const redisRunning = computed(() => {
    return redisVersion?.value?.run === true
  })

  const mongodbRunning = computed(() => {
    return mongodbVersion?.value?.run === true
  })

  const phpVersions = computed(() => {
    return brewStore?.php?.installed ?? []
  })

  const phpDisable = computed(() => {
    return (
      phpVersions?.value?.length === 0 ||
      phpVersions?.value?.some((v) => v.running) ||
      !appStore.versionInited
    )
  })

  const dnsServerRunning = computed(() => {
    return dnsStore.running
  })

  const dnsServerFetching = computed(() => {
    return dnsStore.fetching
  })

  const phpRunning = computed({
    get(): boolean {
      return phpVersions?.value?.length > 0 && phpVersions?.value?.some((v) => v.run)
    },
    set(v: boolean) {
      const all: Array<Promise<any>> = []
      if (v) {
        phpVersions?.value?.forEach((v) => {
          all.push(startService('php', v))
        })
      } else {
        phpVersions?.value?.forEach((v) => {
          all.push(stopService('php', v))
        })
      }
      Promise.all(all).then((res) => {
        let find = res.find((s) => typeof s === 'string')
        if (find) {
          ElMessage.error(find)
        } else {
          ElMessage.success(I18nT('base.success'))
        }
      })
    }
  })

  const groupIsRunning = computed(() => {
    return (
      nginxRunning?.value ||
      apacheRunning?.value ||
      mysqlRunning?.value ||
      mariaDBRunning?.value ||
      phpRunning?.value ||
      redisRunning?.value ||
      memcachedRunning?.value ||
      mongodbRunning?.value ||
      dnsServerRunning?.value
    )
  })

  const groupDisabled = computed(() => {
    const allDisabled =
      apacheDisabled.value &&
      memcachedDisabled.value &&
      mysqlDisabled.value &&
      mariaDBDisabled.value &&
      nginxDisabled.value &&
      phpDisable.value &&
      redisDisabled.value &&
      mongodbDisabled.value
    const running =
      apacheVersion?.value?.running === true ||
      memcachedVersion?.value?.running === true ||
      mysqlVersion?.value?.running === true ||
      mariaDBVersion?.value?.running === true ||
      nginxVersion?.value?.running === true ||
      phpVersions?.value?.some((v) => v.running) ||
      redisVersion?.value?.running === true ||
      mongodbVersion?.value?.running === true ||
      dnsServerFetching?.value === true
    return allDisabled || running || !appStore.versionInited
  })

  const groupClass = computed(() => {
    return {
      'non-draggable': true,
      'swith-power': true,
      on: groupIsRunning.value,
      disabled: groupDisabled.value
    }
  })

  const trayStore = computed(() => {
    return {
      apache: {
        show: showItem?.value?.Apache,
        disabled: apacheDisabled.value,
        run: apacheVersion?.value?.run === true,
        running: apacheVersion?.value?.running === true
      },
      memcached: {
        show: showItem?.value?.Memcached,
        disabled: memcachedDisabled.value,
        run: memcachedVersion?.value?.run === true,
        running: memcachedVersion?.value?.running === true
      },
      mysql: {
        show: showItem?.value?.Mysql,
        disabled: mysqlDisabled.value,
        run: mysqlVersion?.value?.run === true,
        running: mysqlVersion?.value?.running === true
      },
      mariadb: {
        show: showItem?.value?.mariadb,
        disabled: mariaDBDisabled.value,
        run: mariaDBVersion?.value?.run === true,
        running: mariaDBVersion?.value?.running === true
      },
      nginx: {
        show: showItem?.value?.Nginx,
        disabled: nginxDisabled.value,
        run: nginxVersion?.value?.run === true,
        running: nginxVersion?.value?.running === true
      },
      password: appStore?.config?.password,
      lang: appStore?.config?.setup?.lang,
      php: {
        show: showItem?.value?.Php,
        disabled: phpDisable.value,
        run: phpRunning.value,
        running: phpVersions.value.some((v) => v.running)
      },
      redis: {
        show: showItem?.value?.Redis,
        disabled: redisDisabled.value,
        run: redisVersion?.value?.run === true,
        running: redisVersion?.value?.running === true
      },
      mongodb: {
        show: showItem?.value?.MongoDB,
        disabled: mongodbDisabled.value,
        run: mongodbVersion?.value?.run === true,
        running: mongodbVersion?.value?.running === true
      },
      dns: {
        show: showItem?.value?.DNS,
        run: dnsServerRunning.value === true,
        running: dnsServerFetching.value === true
      },
      groupDisabled: groupDisabled.value,
      groupIsRunning: groupIsRunning.value
    }
  })

  watch(groupIsRunning, (val) => {
    IPC.send('Application:tray-status-change', val).then((key: string) => {
      IPC.off(key)
    })
  })

  watch(
    trayStore,
    (v) => {
      const current = JSON.stringify(v)
      if (lastTray !== current) {
        lastTray = current
        console.log('trayStore changed: ', current)
        IPC.send('APP:Tray-Store-Sync', JSON.parse(current)).then((key: string) => {
          IPC.off(key)
        })
      }
    },
    {
      immediate: true,
      deep: true
    }
  )

  const groupDo = () => {
    if (groupDisabled.value) {
      return
    }
    passwordCheck().then(() => {
      const all: Array<Promise<string | boolean>> = []
      if (groupIsRunning?.value) {
        if (showItem?.value?.Nginx && nginxRunning?.value && nginxVersion?.value?.version) {
          all.push(stopService('nginx', nginxVersion?.value))
        }
        if (showItem?.value?.Apache && apacheRunning?.value && apacheVersion?.value?.version) {
          all.push(stopService('apache', apacheVersion?.value))
        }
        if (showItem?.value?.Mysql && mysqlRunning?.value && mysqlVersion?.value?.version) {
          all.push(stopService('mysql', mysqlVersion?.value))
        }
        if (showItem?.value?.mariadb && mariaDBRunning?.value && mariaDBVersion?.value?.version) {
          all.push(stopService('mariadb', mariaDBVersion?.value))
        }
        if (
          showItem?.value?.Memcached &&
          memcachedRunning?.value &&
          memcachedVersion?.value?.version
        ) {
          all.push(stopService('memcached', memcachedVersion?.value))
        }
        if (showItem?.value?.Redis && redisRunning?.value && redisVersion?.value?.version) {
          all.push(stopService('redis', redisVersion?.value))
        }
        if (showItem?.value?.MongoDB && mongodbRunning?.value && mongodbVersion?.value?.version) {
          all.push(stopService('mongodb', mongodbVersion?.value))
        }
        if (showItem?.value?.DNS && dnsServerRunning?.value) {
          all.push(dnsStop())
        }
        if (showItem?.value?.Php) {
          phpVersions?.value?.forEach((v) => {
            all.push(stopService('php', v))
          })
        }
      } else {
        if (showItem?.value?.Nginx && nginxVersion?.value?.version) {
          all.push(startService('nginx', nginxVersion?.value))
        }
        if (showItem?.value?.Apache && apacheVersion?.value?.version) {
          all.push(startService('apache', apacheVersion?.value))
        }
        if (showItem?.value?.Mysql && mysqlVersion?.value?.version) {
          all.push(startService('mysql', mysqlVersion?.value))
        }
        if (showItem?.value?.mariadb && mariaDBVersion?.value?.version) {
          all.push(startService('mariadb', mariaDBVersion?.value))
        }
        if (showItem?.value?.Memcached && memcachedVersion?.value?.version) {
          all.push(startService('memcached', memcachedVersion?.value))
        }
        if (showItem?.value?.Redis && redisVersion?.value?.version) {
          all.push(startService('redis', redisVersion?.value))
        }
        if (showItem?.value?.MongoDB && mongodbVersion?.value?.version) {
          all.push(startService('mongodb', mongodbVersion?.value))
        }
        if (showItem?.value?.DNS) {
          all.push(dnsStart())
        }
        if (showItem?.value?.Php) {
          phpVersions?.value?.forEach((v) => {
            all.push(startService('php', v))
          })
        }
      }
      if (all.length > 0) {
        const err: Array<string> = []
        const run = () => {
          const task = all.pop()
          if (task) {
            task
              .then((s: boolean | string) => {
                if (typeof s === 'string') {
                  err.push(s)
                }
                run()
              })
              .catch((e: any) => {
                err.push(e.toString())
                run()
              })
          } else {
            if (err.length === 0) {
              ElMessage.success(I18nT('base.success'))
            } else {
              ElMessage.error(err.join('<br/>'))
            }
          }
        }
        run()
      }
    })
  }

  const switchChange = (flag: string) => {
    passwordCheck().then(() => {
      let fn = null
      let promise: Promise<any> | null = null
      switch (flag) {
        case 'dns':
          if (dnsServerFetching?.value) return
          fn = dnsServerRunning?.value ? dnsStop : dnsStart
          promise = fn()
          break
        case 'nginx':
          if (!nginxVersion?.value?.version) return
          fn = nginxRunning?.value ? stopService : startService
          promise = fn('nginx', nginxVersion?.value)
          break
        case 'mysql':
          if (!mysqlVersion?.value?.version) return
          fn = mysqlRunning?.value ? stopService : startService
          promise = fn('mysql', mysqlVersion?.value)
          break
        case 'mariadb':
          if (!mariaDBVersion?.value?.version) return
          fn = mariaDBRunning?.value ? stopService : startService
          promise = fn('mariadb', mariaDBVersion?.value)
          break
        case 'apache':
          if (!apacheVersion?.value?.version) return
          fn = apacheRunning?.value ? stopService : startService
          promise = fn('apache', apacheVersion?.value)
          break
        case 'memcached':
          if (!memcachedVersion?.value?.version) return
          fn = memcachedRunning?.value ? stopService : startService
          promise = fn('memcached', memcachedVersion?.value)
          break
        case 'redis':
          if (!redisVersion?.value?.version) return
          fn = redisRunning?.value ? stopService : startService
          promise = fn('redis', redisVersion?.value)
          break
        case 'mongodb':
          if (!mongodbVersion?.value?.version) return
          fn = mongodbRunning?.value ? stopService : startService
          promise = fn('mongodb', mongodbVersion?.value)
          break
      }
      promise?.then((res) => {
        if (typeof res === 'string') {
          ElMessage.error(res)
        } else {
          ElMessage.success(I18nT('base.success'))
        }
      })
    })
  }

  const nav = (page: string) => {
    return new Promise((resolve) => {
      if (page === '/dns') {
        dnsStore.getIP()
      }
      if (currentPage.value === page) {
        resolve(true)
      }
      Router.push({
        path: page
      })
        .then(() => {
          resolve(true)
        })
        .catch((err) => {
          console.log('router err: ', err)
          resolve(true)
        })
      currentPage.value = page
    })
  }

  IPC.on('APP:Tray-Command').then((key: string, fn: string, arg: any) => {
    console.log('on APP:Tray-Command', key, fn, arg)
    if (fn === 'switchChange' && arg === 'php') {
      phpRunning.value = !phpRunning.value
      return
    }
    const fns: { [k: string]: Function } = {
      groupDo,
      switchChange
    }
    fns[fn] && fns[fn](arg)
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
