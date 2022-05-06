<template>
  <div class="apache-service">
    <div class="block">
      <span>当前版本:</span>
      <span class="ml-30" v-text="versionTxt"></span>
    </div>

    <div class="block mt-20">
      <span>当前状态:</span>
      <div v-if="serverRunning" class="ml-30 status running">
        <span class="mr-10">运行中</span>
        <yb-icon :svg="import('@/svg/task-start.svg?raw')" width="16" height="16" />
      </div>
      <div v-else class="ml-30 status">
        <span class="mr-10">未运行</span>
        <yb-icon :svg="import('@/svg/task-stop.svg?raw')" width="16" height="16" />
      </div>
    </div>

    <div class="block mt-20">
      <el-button
        v-if="serverRunning"
        :loading="current_task === 'stop'"
        :disabled="disabled"
        @click="serviceDo('stop')"
        >停止</el-button
      >
      <el-button
        v-else
        :loading="current_task === 'start'"
        :disabled="disabled"
        @click="serviceDo('start')"
        >启动</el-button
      >
      <el-button
        :loading="current_task === 'restart'"
        :disabled="disabled"
        class="ml-30"
        @click="serviceDo('restart')"
        >重启</el-button
      >
      <el-button
        v-if="showReloadBtn"
        :loading="current_task === 'reload'"
        :disabled="disabled || !serverRunning"
        class="ml-30"
        @click="serviceDo('reload')"
        >重载配置</el-button
      >
    </div>

    <ul class="logs mt-20">
      <template v-for="(log, index) in logs" :key="index">
        <li class="mb-5" v-html="log"></li>
      </template>
    </ul>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { AppMixins } from '@/mixins/AppMixins.js'
  import { reloadService, startService, stopService } from '@/util/Service.js'

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
        current_task: ''
      }
    },
    computed: {
      showReloadBtn() {
        return this.typeFlag !== 'memcached'
      },
      ...mapGetters('task', {
        taskApache: 'apache',
        taskNginx: 'nginx',
        taskPhp: 'php',
        taskMemcached: 'memcached',
        taskMysql: 'mysql',
        taskRedis: 'redis'
      }),
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
      isRunning() {
        return this.currentTask.running
      },
      logs() {
        return this.currentTask.log
      },
      ...mapGetters('app', {
        stat: 'stat'
      }),
      serverRunning() {
        return this.stat[this.typeFlag]
      },
      disabled() {
        return this.isRunning || !this.version?.version
      },
      versionTxt() {
        const v = this.version?.version
        const p = this.version?.path
        if (v && p) {
          return `${v} - ${p}`
        }
        return ''
      }
    },
    watch: {
      isRunning(nv) {
        if (!nv) {
          this.current_task = ''
        }
      }
    },
    created: function () {
      if (!this.isRunning) {
        this.logs.splice(0)
      }
    },
    methods: {
      serviceDo(flag) {
        this.logs.splice(0)
        this.current_task = flag
        switch (flag) {
          case 'stop':
            stopService(this.typeFlag, this.version)
            break
          case 'start':
          case 'restart':
            startService(this.typeFlag, this.version)
            break
          case 'reload':
            reloadService(this.typeFlag, this.version)
            break
        }
      }
    }
  }
</script>

<style lang="scss">
  .apache-service {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 40px 0 0 40px;
    .block {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      .status {
        display: flex;
        align-items: center;

        &.running {
          color: #01cc74;
        }
      }
    }
    .logs {
      flex: 1;
      width: 100%;
      display: flex;
      flex-direction: column;
      overflow: auto;
      > li {
        width: 100%;
        word-break: break-all;
      }
    }
  }
</style>
