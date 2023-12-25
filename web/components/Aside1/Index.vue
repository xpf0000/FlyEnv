<template>
  <el-aside width="280px" class="aside">
    <div class="aside-inner">
      <ul class="top-tool">
        <el-tooltip :show-after="800" content="Documentation">
          <li @click="toDoc">
            <yb-icon
              style="opacity: 0.7"
              :svg="import('@/svg/question.svg?raw')"
              width="17"
              height="17"
            />
          </li>
        </el-tooltip>
        <li :class="groupClass" @click="groupDo">
          <yb-icon :svg="import('@/svg/switch.svg?raw')" width="24" height="24" />
        </li>
      </ul>

      <ul class="menu top-menu">
        <HostModule :current-page="currentPage" @nav="nav" />
        <ApacheModule ref="apacheModule" :current-page="currentPage" @nav="nav" />
        <NginxModule ref="nginxModule" :current-page="currentPage" @nav="nav" />
        <PhpModule ref="phpModule" :current-page="currentPage" @nav="nav" />
        <MysqlModule ref="mysqlModule" :current-page="currentPage" @nav="nav" />
        <MariadbModule ref="mariadbModule" :current-page="currentPage" @nav="nav" />
        <MongodbModule ref="mongoModule" :current-page="currentPage" @nav="nav" />
        <PostgreSqlModule ref="postgresqlModule" :current-page="currentPage" @nav="nav" />
        <MemcachedModule ref="memcachedModule" :current-page="currentPage" @nav="nav" />
        <RedisModule ref="redisModule" :current-page="currentPage" @nav="nav" />
        <DnsModule ref="dnsModule" :current-page="currentPage" @nav="nav" />
        <FtpModule ref="ftpModule" :current-page="currentPage" @nav="nav" />
        <NodejsModule :current-page="currentPage" @nav="nav" />
        <HttpserveModule :current-page="currentPage" @nav="nav" />
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
            <span class="title">Setup</span>
          </div>
        </li>
      </ul>
    </div>
  </el-aside>
</template>

<script lang="ts" setup>
  import { ref, computed } from 'vue'
  import { AppStore } from '../../store/app'
  import { DnsStore } from '../../store/dns'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'
  import Router from '../../router/index'

  import HostModule from './module/host/index.vue'
  import ApacheModule from './module/apache/index.vue'
  import NginxModule from './module/nginx/index.vue'
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

  const apacheModule = ref()
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
  const currentPage = ref('/host')

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
      postgresqlModule?.value?.serviceRunning
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
      postgresqlModule?.value?.serviceDisabled
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
      postgresqlModule?.value?.serviceFetching
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

  const toDoc = () => {}

  const groupDo = () => {
    if (groupDisabled.value) {
      return
    }
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
      postgresqlModule
    ]
    const all: Array<Promise<string | boolean>> = []
    modules.forEach((m: any) => {
      const arr = m?.value?.groupDo(groupIsRunning?.value) ?? []
      all.push(...arr)
    })
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
</script>

<style lang="scss">
  .aside-inner {
    display: flex;
    height: 100%;
    flex-flow: column;
    overflow: hidden;

    > .top-tool {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 50px 20px 12px 20px;
      list-style: none;
      flex-shrink: 0;

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
    overflow: auto;
  }
  .setup-menu {
    flex-shrink: 0;
    border-top: 1px solid #242737;
  }
  .bottom-menu {
    margin-bottom: 24px;
  }
</style>
