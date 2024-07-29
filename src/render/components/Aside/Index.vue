<template>
  <el-aside width="280px" class="aside">
    <div class="aside-inner">
      <ul class="top-tool">
        <el-popover :show-after="800">
          <template #default>
            <span>{{ $t('base.about') }}</span>
          </template>
          <template #reference>
            <li @click="toDoc">
              <yb-icon
                style="opacity: 0.7"
                :svg="import('@/svg/question.svg?raw')"
                width="17"
                height="17"
              />
            </li>
          </template>
        </el-popover>
        <li :class="groupClass" @click="groupDo">
          <yb-icon :svg="import('@/svg/switch.svg?raw')" width="24" height="24" />
        </li>
      </ul>
      <ul class="menu top-menu">
        <HostModule :current-page="currentPage" @nav="nav" />
        <ApacheModule ref="apacheModule" :current-page="currentPage" @nav="nav" />
        <NginxModule ref="nginxModule" :current-page="currentPage" @nav="nav" />
        <CaddyModule ref="caddyModule" :current-page="currentPage" @nav="nav" />
        <PhpModule ref="phpModule" :current-page="currentPage" @nav="nav" />
        <MysqlModule ref="mysqlModule" :current-page="currentPage" @nav="nav" />
        <MariadbModule ref="mariadbModule" :current-page="currentPage" @nav="nav" />
        <MongodbModule ref="mongoModule" :current-page="currentPage" @nav="nav" />
        <PostgreSqlModule ref="postgresqlModule" :current-page="currentPage" @nav="nav" />
        <MemcachedModule ref="memcachedModule" :current-page="currentPage" @nav="nav" />
        <RedisModule ref="redisModule" :current-page="currentPage" @nav="nav" />
        <NodejsModule :current-page="currentPage" @nav="nav" />
        <HttpserveModule :current-page="currentPage" @nav="nav" />
        <DnsModule ref="dnsModule" :current-page="currentPage" @nav="nav" />
        <FtpModule ref="ftpModule" :current-page="currentPage" @nav="nav" />
        <ToolsModule :current-page="currentPage" @nav="nav" />
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
            <span class="title">{{ $t('base.leftSetup') }}</span>
          </div>
        </li>
      </ul>
    </div>
  </el-aside>
</template>

<script lang="ts" setup>
  import { ref, computed, watch } from 'vue'
  import { passwordCheck } from '@/util/Brew'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { DnsStore } from '@/store/dns'
  import { FtpStore } from '@/store/ftp'
  import { I18nT } from '@shared/lang'
  import Router from '@/router/index'

  import HostModule from './module/host/index.vue'
  import ApacheModule from './module/apache/index.vue'
  import NginxModule from './module/nginx/index.vue'
  import CaddyModule from './module/caddy/index.vue'
  import PhpModule from './module/php/index.vue'
  import MysqlModule from './module/mysql/index.vue'
  import MariadbModule from './module/mariadb/index.vue'
  import MongodbModule from './module/mongodb/index.vue'
  import MemcachedModule from './module/memcached/index.vue'
  import RedisModule from './module/redis/index.vue'
  import DnsModule from './module/dns/index.vue'
  import FtpModule from './module/ftp/index.vue'
  import NodejsModule from './module/nodejs/index.vue'
  import HttpserveModule from './module/httpserve/index.vue'
  import ToolsModule from './module/tools/index.vue'
  import PostgreSqlModule from './module/postgresql/index.vue'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { MysqlStore } from '@/store/mysql'
  import Base from '@/core/Base'


  let lastTray = ''

  const apacheModule = ref()
  const caddyModule = ref()
  const nginxModule = ref()
  const phpModule = ref()
  const mysqlModule = ref()
  const mariadbModule = ref()
  const mongoModule = ref()
  const memcachedModule = ref()
  const redisModule = ref()
  const dnsModule = ref()
  const ftpModule = ref()
  const postgresqlModule = ref()

  const appStore = AppStore()
  const dnsStore = DnsStore()
  const ftpStore = FtpStore()
  const mysqlStore = MysqlStore()

  const currentPage = ref('/host')

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem
  })

  const groupIsRunning = computed(() => {
    return (
      nginxModule?.value?.serviceRunning ||
      apacheModule?.value?.serviceRunning ||
      mysqlModule?.value?.serviceRunning ||
      mariadbModule?.value?.serviceRunning ||
      phpModule?.value?.serviceRunning ||
      redisModule?.value?.serviceRunning ||
      memcachedModule?.value?.serviceRunning ||
      mongoModule?.value?.serviceRunning ||
      dnsModule?.value?.serviceRunning ||
      ftpModule?.value?.serviceRunning ||
      postgresqlModule?.value?.serviceRunning ||
      caddyModule?.value?.serviceRunning
    )
  })

  const groupDisabled = computed(() => {
    const allDisabled =
      apacheModule?.value?.serviceDisabled &&
      memcachedModule?.value?.serviceDisabled &&
      mysqlModule?.value?.serviceDisabled &&
      mariadbModule?.value?.serviceDisabled &&
      nginxModule?.value?.serviceDisabled &&
      phpModule?.value?.serviceDisabled &&
      redisModule?.value?.serviceDisabled &&
      mongoModule?.value?.serviceDisabled &&
      ftpModule?.value?.serviceDisabled &&
      postgresqlModule?.value?.serviceDisabled &&
      caddyModule?.value?.serviceDisabled

    const running =
      apacheModule?.value?.serviceFetching ||
      memcachedModule?.value?.serviceFetching ||
      mysqlModule?.value?.serviceFetching ||
      mariadbModule?.value?.serviceFetching ||
      nginxModule?.value?.serviceFetching ||
      phpModule?.value?.serviceFetching ||
      redisModule?.value?.serviceFetching ||
      mongoModule?.value?.serviceFetching ||
      dnsModule?.value?.serviceFetching ||
      ftpModule?.value?.serviceFetching ||
      postgresqlModule?.value?.serviceFetching ||
      caddyModule?.value?.serviceFetching

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
        disabled: apacheModule?.value?.serviceDisabled,
        run: apacheModule?.value?.serviceRunning,
        running: apacheModule?.value?.serviceFetching
      },
      memcached: {
        show: showItem?.value?.Memcached,
        disabled: memcachedModule?.value?.serviceDisabled,
        run: memcachedModule?.value?.serviceRunning,
        running: memcachedModule?.value?.serviceFetching
      },
      mysql: {
        show: showItem?.value?.Mysql,
        disabled: mysqlModule?.value?.serviceDisabled,
        run: mysqlModule?.value?.serviceRunning,
        running: mysqlModule?.value?.serviceFetching
      },
      mariadb: {
        show: showItem?.value?.mariadb,
        disabled: mariadbModule?.value?.serviceDisabled,
        run: mariadbModule?.value?.serviceRunning,
        running: mariadbModule?.value?.serviceFetching
      },
      nginx: {
        show: showItem?.value?.Nginx,
        disabled: nginxModule?.value?.serviceDisabled,
        run: nginxModule?.value?.serviceRunning,
        running: nginxModule?.value?.serviceFetching
      },
      caddy: {
        show: showItem?.value?.Caddy !== false,
        disabled: caddyModule?.value?.serviceDisabled,
        run: caddyModule?.value?.serviceRunning,
        running: caddyModule?.value?.serviceFetching
      },
      password: appStore?.config?.password,
      lang: appStore?.config?.setup?.lang,
      theme: appStore?.config?.setup?.theme,
      php: {
        show: showItem?.value?.Php,
        disabled: phpModule?.value?.serviceDisabled,
        run: phpModule?.value?.serviceRunning,
        running: phpModule?.value?.serviceFetching
      },
      redis: {
        show: showItem?.value?.Redis,
        disabled: redisModule?.value?.serviceDisabled,
        run: redisModule?.value?.serviceRunning,
        running: redisModule?.value?.serviceFetching
      },
      mongodb: {
        show: showItem?.value?.MongoDB,
        disabled: mongoModule?.value?.serviceDisabled,
        run: mongoModule?.value?.serviceRunning,
        running: mongoModule?.value?.serviceFetching
      },
      dns: {
        show: showItem?.value?.DNS,
        run: dnsModule?.value?.serviceRunning,
        running: dnsModule?.value?.serviceFetching
      },
      ftp: {
        show: showItem?.value?.FTP,
        disabled: ftpModule?.value?.serviceDisabled,
        run: ftpModule?.value?.serviceRunning,
        running: ftpModule?.value?.serviceFetching
      },
      postgresql: {
        show: showItem?.value?.PostgreSql !== false,
        disabled: postgresqlModule?.value?.serviceDisabled,
        run: postgresqlModule?.value?.serviceRunning,
        running: postgresqlModule?.value?.serviceFetching
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

  const toDoc = () => {
    Base.Dialog(import('@/components/About/index.vue'))
      .className('about-dialog')
      .title(I18nT('base.about'))
      .noFooter()
      .show()
  }

  const groupDo = () => {
    if (groupDisabled.value) {
      return
    }
    passwordCheck().then(() => {
      const modules = [
        apacheModule,
        nginxModule,
        phpModule,
        mysqlModule,
        mariadbModule,
        mongoModule,
        memcachedModule,
        redisModule,
        dnsModule,
        ftpModule,
        postgresqlModule,
        caddyModule
      ]
      const all: Array<Promise<string | boolean>> = []
      modules.forEach((m: any) => {
        const arr = m?.value?.groupDo(groupIsRunning?.value) ?? []
        all.push(...arr)
      })
      if (all.length > 0) {
        let groupFn: () => Promise<true | string>
        groupFn = groupIsRunning?.value ? mysqlStore.groupStop : mysqlStore.groupStart
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
              if (showItem?.value?.Mysql) {
                groupFn().then()
              }
              MessageSuccess(I18nT('base.success'))
            } else {
              MessageError(err.join('<br/>'))
            }
          }
        }
        run()
      }
    })
  }

  const switchChange = (flag: string) => {
    switch (flag) {
      case 'dns':
        dnsModule?.value?.switchChange()
        break
      case 'nginx':
        nginxModule?.value?.switchChange()
        break
      case 'mysql':
        mysqlModule?.value?.switchChange()
        break
      case 'mariadb':
        mariadbModule?.value?.switchChange()
        break
      case 'apache':
        apacheModule?.value?.switchChange()
        break
      case 'memcached':
        memcachedModule?.value?.switchChange()
        break
      case 'redis':
        redisModule?.value?.switchChange()
        break
      case 'mongodb':
        mongoModule?.value?.switchChange()
        break
      case 'ftp':
        ftpModule?.value?.switchChange()
        break
      case 'postgresql':
        postgresqlModule?.value?.switchChange()
        break
      case 'caddy':
        caddyModule?.value?.switchChange()
        break
    }
  }

  const nav = (page: string) => {
    return new Promise((resolve) => {
      if (page === '/dns') {
        dnsStore.getIP()
      }
      if (page === '/ftp') {
        ftpStore.getIP()
        ftpStore.getPort()
        ftpStore.getAllFtp()
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
      phpModule?.value?.switchChange()
      return
    }
    const fns: { [k: string]: Function } = {
      groupDo,
      switchChange
    }
    fns[fn] && fns[fn](arg)
  })
</script>
