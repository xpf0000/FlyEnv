<template>
  <el-aside width="280px" :class="['aside', 'hidden-sm-and-down', { draggable: asideDraggable }]">
    <div class="aside-inner">
      <ul class="top-tool">
        <li
          :class="
            'non-draggable swith-power' +
            (nginxRunning || apacheRunning || mysqlRunning || phpRunning ? ' on' : '')
          "
          @click="groupDo"
        >
          <yb-icon :svg="import('@/svg/switch.svg?raw')" width="24" height="24" />
        </li>
      </ul>

      <ul class="menu top-menu">
        <li
          v-if="common.showItem.Hosts"
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
            :disabled="!nginxVersion?.version || taskNginx.running"
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
            :disabled="!apacheVersion?.version || taskApache.running"
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
            :disabled="!mysqlVersion?.version || taskMysql.running"
            :value="mysqlRunning"
            @change="switchChange('mysql')"
          >
          </el-switch>
        </li>

        <li
          v-if="common.showItem.Php"
          :class="'non-draggable' + (currentPage === '/php' ? ' active' : '')"
          @click="nav('/php', $event)"
        >
          <div class="left">
            <div class="icon-block">
              <yb-icon :svg="import('@/svg/php.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Php</span>
          </div>

          <el-switch
            :disabled="!phpVersion?.version || taskPhp.running"
            :value="phpRunning"
            @change="switchChange('php')"
          >
          </el-switch>
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
            :disabled="!memcachedVersion?.version || taskMemcached.running"
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
            :disabled="!redisVersion?.version || taskRedis.running"
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
  import { mapGetters, mapState } from 'vuex'
  import { startService, stopService } from '@/util/Service.js'
  const is = require('electron-is')
  export default {
    name: 'MoAside',
    components: {},
    data: function () {
      return {
        currentPage: '/host'
      }
    },
    computed: {
      ...mapGetters('app', {
        config: 'config'
      }),
      common() {
        return this.config?.setup?.common ?? {}
      },
      ...mapState('app', {
        nginxRunning: (state) => state.stat.nginx,
        phpRunning: (state) => state.stat.php,
        mysqlRunning: (state) => state.stat.mysql,
        apacheRunning: (state) => state.stat.apache,
        memcachedRunning: (state) => state.stat.memcached,
        redisRunning: (state) => state.stat.redis,

        nginxVersion: (state) => state.config?.server?.nginx?.current ?? '',
        phpVersion: (state) => state.config?.server?.php?.current ?? '',
        mysqlVersion: (state) => state.config?.server?.mysql?.current ?? '',
        apacheVersion: (state) => state.config?.server?.apache?.current ?? '',
        memcachedVersion: (state) => state.config?.server?.memcached?.current ?? '',
        redisVersion: (state) => state.config?.server?.redis?.current ?? ''
      }),
      ...mapGetters('task', {
        taskApache: 'apache',
        taskNginx: 'nginx',
        taskPhp: 'php',
        taskMemcached: 'memcached',
        taskMysql: 'mysql',
        taskRedis: 'redis'
      }),
      asideDraggable: function () {
        return is.macOS()
      }
    },
    watch: {
      currentPage() {
        console.log('currentPage : ', this.currentPage)
      }
    },
    methods: {
      groupDo() {
        if (
          this.taskApache.running ||
          this.taskNginx.running ||
          this.taskPhp.running ||
          this.taskMemcached.running ||
          this.taskMysql.running ||
          this.taskRedis.running
        ) {
          return
        }
        let running = false
        if (this.common.showItem.Nginx && this.nginxRunning) {
          running = true
          stopService('nginx', this.nginxVersion)
        }
        if (this.common.showItem.Apache && this.apacheRunning) {
          running = true
          stopService('apache', this.apacheVersion)
        }
        if (this.common.showItem.Php && this.phpRunning) {
          running = true
          stopService('php', this.phpVersion)
        }
        if (this.common.showItem.Mysql && this.mysqlRunning) {
          running = true
          stopService('mysql', this.mysqlVersion)
        }
        if (this.common.showItem.Memcached && this.memcachedRunning) {
          running = true
          stopService('memcached', this.memcachedVersion)
        }
        if (this.common.showItem.Redis && this.redisRunning) {
          running = true
          stopService('redis', this.redisVersion)
        }
        if (!running) {
          if (this.common.showItem.Nginx && this.nginxVersion) {
            startService('nginx', this.nginxVersion)
          }
          if (this.common.showItem.Apache && this.apacheVersion) {
            startService('apache', this.apacheVersion)
          }
          if (this.common.showItem.Php && this.phpVersion) {
            startService('php', this.phpVersion)
          }
          if (this.common.showItem.Mysql && this.mysqlVersion) {
            startService('mysql', this.mysqlVersion)
          }
          if (this.common.showItem.Memcached && this.memcachedVersion) {
            startService('memcached', this.memcachedVersion)
          }
          if (this.common.showItem.Redis && this.redisVersion) {
            startService('redis', this.redisVersion)
          }
        }
      },
      switchChange(flag) {
        let fn = null
        switch (flag) {
          case 'nginx':
            fn = this.nginxRunning ? stopService : startService
            fn('nginx', this.nginxVersion)
            break
          case 'php':
            fn = this.phpRunning ? stopService : startService
            fn('php', this.phpVersion)
            break
          case 'mysql':
            fn = this.mysqlRunning ? stopService : startService
            fn('mysql', this.mysqlVersion)
            break
          case 'apache':
            fn = this.apacheRunning ? stopService : startService
            fn('apache', this.apacheVersion)
            break
          case 'memcached':
            fn = this.memcachedRunning ? stopService : startService
            fn('memcached', this.memcachedVersion)
            break
          case 'redis':
            fn = this.redisRunning ? stopService : startService
            fn('redis', this.redisVersion)
            break
        }
      },
      nav(page) {
        if (this.currentPage === page) {
          return
        }
        this.$router
          .push({
            path: page
          })
          .then(() => {})
          .catch((err) => {
            console.log('router err: ', err)
          })
        this.currentPage = page
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
