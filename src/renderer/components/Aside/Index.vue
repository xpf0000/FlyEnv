<template>
  <el-aside width="280px" :class="['aside', 'hidden-sm-and-down', { 'draggable': asideDraggable }]">

    <div class="aside-inner">

      <ul class="top-tool">
        <li @click="groupDo" :class="'non-draggable swith-power'+(nginxRunning || apacheRunning || mysqlRunning || phpRunning ? ' on' : '')">
          <mo-icon name="switch" width="24" height="24" />
        </li>
      </ul>

      <ul class="menu top-menu">
        <li @click="nav('/host',$event)" :class="'non-draggable' + (currentPage === '/host' ? ' active' : '')">
          <div class="left">
            <div class="icon-block">
              <mo-icon name="host" width="30" height="30" />
            </div>
            <span class="title">Hosts</span>
          </div>
        </li>

        <li @click="nav('/nginx',$event)" :class="'non-draggable' + (currentPage === '/nginx' ? ' active' : '')">
          <div class="left">
            <div class="icon-block">
              <mo-icon name="nginx" width="28" height="28" />
            </div>
            <span class="title">Nginx</span>
          </div>

          <el-switch
            :disabled="!nginxVersion || nginxTaskRunning"
            :value="nginxRunning"
            @change="switchChange('nginx')"
          >
          </el-switch>
        </li>

        <li @click="nav('/apache',$event)" :class="'non-draggable' + (currentPage === '/apache' ? ' active' : '')">
          <div class="left">
            <div class="icon-block">
              <mo-icon name="apache" width="30" height="30" />
            </div>
            <span class="title">Apache</span>
          </div>

          <el-switch
            :disabled="!apacheVersion || apacheTaskRunning"
            :value="apacheRunning"
            @change="switchChange('apache')"
          >
          </el-switch>
        </li>

        <li @click="nav('/mysql',$event)" class="non-draggable" :class="'non-draggable' + (currentPage === '/mysql' ? ' active' : '')">
          <div class="left">
            <div class="icon-block">
              <mo-icon name="mysql" width="30" height="30" />
            </div>
            <span class="title">Mysql</span>
          </div>

          <el-switch
            :disabled="!mysqlVersion || mysqlTaskRunning"
            :value="mysqlRunning"
            @change="switchChange('mysql')"
          >
          </el-switch>
        </li>

        <li @click="nav('/php',$event)" :class="'non-draggable' + (currentPage === '/php' ? ' active' : '')">
          <div class="left">
            <div class="icon-block">
              <mo-icon name="php" width="30" height="30" />
            </div>
            <span class="title">Php</span>
          </div>

          <el-switch
            :disabled="!phpVersion || phpTaskRunning"
            :value="phpRunning"
            @change="switchChange('php')"
          >
          </el-switch>
        </li>

        <li @click="nav('/memcached',$event)" :class="'non-draggable' + (currentPage === '/memcached' ? ' active' : '')">
          <div class="left">
            <div class="icon-block">
              <mo-icon name="memcached" width="30" height="30" />
            </div>
            <span class="title">Memcached</span>
          </div>

          <el-switch
            :disabled="!memcachedVersion || memTaskRunning"
            :value="memcachedRunning"
            @change="switchChange('memcached')"
          >
          </el-switch>
        </li>

        <li @click="nav('/redis',$event)" :class="'non-draggable' + (currentPage === '/redis' ? ' active' : '')">
          <div class="left">
            <div class="icon-block">
              <mo-icon name="redis" width="28" height="28" />
            </div>
            <span class="title">Redis</span>
          </div>

          <el-switch
            :disabled="!redisVersion || redisTaskRunning"
            :value="redisRunning"
            @change="switchChange('redis')"
          >
          </el-switch>
        </li>

        <li @click="nav('/node',$event)" :class="'non-draggable' + (currentPage === '/node' ? ' active' : '')">
          <div class="left">
            <div class="icon-block">
              <mo-icon name="nodejs" width="28" height="28" />
            </div>
            <span class="title">NodeJS</span>
          </div>
        </li>

        <li @click="nav('/tools',$event)" :class="'non-draggable' + (currentPage === '/tools' ? ' active' : '')">
          <div class="left">
            <div class="icon-block">
              <mo-icon name="tool" width="30" height="30" />
            </div>
            <span class="title">Tools</span>
          </div>
        </li>

      </ul>

    </div>

  </el-aside>
</template>

<script>
  import is from 'electron-is'
  import { mapState } from 'vuex'
  import '@/components/Icons/switch'
  import '@/components/Icons/host'
  import '@/components/Icons/nginx'
  import '@/components/Icons/apache'
  import '@/components/Icons/mysql'
  import '@/components/Icons/php'
  import '@/components/Icons/memcached'
  import '@/components/Icons/redis'
  import '@/components/Icons/tool'
  import '@/components/Icons/nodejs'
  import { hasClass } from '@shared/utils'
  export default {
    name: 'mo-aside',
    data: function () {
      return {
        currentPage: '/host'
      }
    },
    components: {
    },
    computed: {
      ...mapState('app', {
        nginxRunning: state => state.stat.nginx,
        phpRunning: state => state.stat.php,
        mysqlRunning: state => state.stat.mysql,
        apacheRunning: state => state.stat.apache,
        memcachedRunning: state => state.stat.memcached,
        redisRunning: state => state.stat.redis
      }),
      ...mapState('preference', {
        nginxVersion: state => state.config.server.nginx.current,
        phpVersion: state => state.config.server.php.current,
        mysqlVersion: state => state.config.server.mysql.current,
        apacheVersion: state => state.config.server.apache.current,
        memcachedVersion: state => state.config.server.memcached.current,
        redisVersion: state => state.config.server.redis.current
      }),
      ...mapState('apache', {
        apacheTaskRunning: state => state.taskRunning
      }),
      ...mapState('nginx', {
        nginxTaskRunning: state => state.taskRunning
      }),
      ...mapState('mysql', {
        mysqlTaskRunning: state => state.taskRunning
      }),
      ...mapState('php', {
        phpTaskRunning: state => state.taskRunning
      }),
      ...mapState('memcached', {
        memTaskRunning: state => state.taskRunning
      }),
      ...mapState('redis', {
        redisTaskRunning: state => state.taskRunning
      }),
      asideDraggable: function () {
        return is.macOS()
      }
    },
    watch: {
      currentPage () {
        console.log('currentPage : ', this.currentPage)
      }
    },
    methods: {
      groupDo () {
        if (this.nginxTaskRunning || this.apacheTaskRunning || this.phpTaskRunning || this.mysqlTaskRunning || this.memTaskRunning || this.redisTaskRunning) {
          return
        }
        let running = false
        if (this.nginxRunning) {
          running = true
          this.$store.dispatch('nginx/start', { type: 'nginx-service', v: this.nginxVersion })
          this.$electron.ipcRenderer.send('command', 'nginx', 'stopService', this.nginxVersion)
        }
        if (this.apacheRunning) {
          running = true
          this.$store.dispatch('apache/start', { type: 'apache-service', v: this.apacheVersion })
          this.$electron.ipcRenderer.send('command', 'apache', 'stopService', this.apacheVersion)
        }
        if (this.phpRunning) {
          running = true
          this.$store.dispatch('php/start', { type: 'php-service', v: this.phpVersion })
          this.$electron.ipcRenderer.send('command', 'php', 'stopService', this.phpVersion)
        }
        if (this.mysqlRunning) {
          running = true
          this.$store.dispatch('mysql/start', { type: 'mysql-service', v: this.mysqlVersion })
          this.$electron.ipcRenderer.send('command', 'mysql', 'stopService', this.mysqlVersion)
        }
        if (this.memcachedRunning) {
          running = true
          this.$store.dispatch('memcached/start', { type: 'memcached-service', v: this.memcachedVersion })
          this.$electron.ipcRenderer.send('command', 'memcached', 'stopService', this.memcachedVersion)
        }
        if (this.redisRunning) {
          running = true
          this.$store.dispatch('redis/start', { type: 'redis-service', v: this.redisVersion })
          this.$electron.ipcRenderer.send('command', 'redis', 'stopService', this.redisVersion)
        }
        if (!running) {
          if (this.nginxVersion) {
            this.$store.dispatch('nginx/start', { type: 'nginx-service', v: this.nginxVersion })
            this.$electron.ipcRenderer.send('command', 'nginx', 'startService', this.nginxVersion)
          }
          if (this.apacheVersion) {
            this.$store.dispatch('apache/start', { type: 'apache-service', v: this.apacheVersion })
            this.$electron.ipcRenderer.send('command', 'apache', 'startService', this.apacheVersion)
          }
          if (this.phpVersion) {
            this.$store.dispatch('php/start', { type: 'php-service', v: this.phpVersion })
            this.$electron.ipcRenderer.send('command', 'php', 'startService', this.phpVersion)
          }
          if (this.mysqlVersion) {
            this.$store.dispatch('mysql/start', { type: 'mysql-service', v: this.mysqlVersion })
            this.$electron.ipcRenderer.send('command', 'mysql', 'startService', this.mysqlVersion)
          }
          if (this.memcachedVersion) {
            this.$store.dispatch('memcached/start', { type: 'memcached-service', v: this.memcachedVersion })
            this.$electron.ipcRenderer.send('command', 'memcached', 'startService', this.memcachedVersion)
          }
          if (this.redisVersion) {
            this.$store.dispatch('redis/start', { type: 'redis-service', v: this.redisVersion })
            this.$electron.ipcRenderer.send('command', 'redis', 'startService', this.redisVersion)
          }
        }
      },
      switchChange (flag) {
        let arg = ''
        switch (flag) {
          case 'nginx':
            this.$store.dispatch('nginx/start', { type: 'nginx-service', v: this.nginxVersion })
            arg = this.nginxRunning ? 'stopService' : 'startService'
            this.$electron.ipcRenderer.send('command', 'nginx', arg, this.nginxVersion)
            break
          case 'php':
            this.$store.dispatch('php/start', { type: 'php-service', v: this.phpVersion })
            arg = this.phpRunning ? 'stopService' : 'startService'
            this.$electron.ipcRenderer.send('command', 'php', arg, this.phpVersion)
            break
          case 'mysql':
            this.$store.dispatch('mysql/start', { type: 'mysql-service', v: this.mysqlVersion })
            arg = this.mysqlRunning ? 'stopService' : 'startService'
            this.$electron.ipcRenderer.send('command', 'mysql', arg, this.mysqlVersion)
            break
          case 'apache':
            this.$store.dispatch('apache/start', { type: 'apache-service', v: this.apacheVersion })
            arg = this.apacheRunning ? 'stopService' : 'startService'
            this.$electron.ipcRenderer.send('command', 'apache', arg, this.apacheVersion)
            break
          case 'memcached':
            this.$store.dispatch('memcached/start', { type: 'memcached-service', v: this.memcachedVersion })
            arg = this.apacheRunning ? 'stopService' : 'startService'
            this.$electron.ipcRenderer.send('command', 'memcached', arg, this.memcachedVersion)
            break
          case 'redis':
            this.$store.dispatch('redis/start', { type: 'redis-service', v: this.redisVersion })
            arg = this.apacheRunning ? 'stopService' : 'startService'
            this.$electron.ipcRenderer.send('command', 'redis', arg, this.redisVersion)
            break
        }
      },
      nav (page, e) {
        if (hasClass(e.target, 'el-switch__core')) {
          return
        }
        this.$router.push({
          path: page
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
    >.top-tool{
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 55px 20px 12px 20px;
      list-style: none;
      > li{
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
      .left{
        height: 100%;
        display: flex;
        align-items: center;
        .icon-block{
          width: 38px;
          height: 45px;
          display: flex;
          align-items: center;
        }
        .title{
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
  .bottom-menu {
    margin-bottom: 24px;
  }
</style>
