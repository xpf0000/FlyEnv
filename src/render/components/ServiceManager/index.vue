<template>
  <div class="apache-service">
    <div class="block">
      <span class="left-title">{{ $t('base.currentVersion') }}:</span>
      <span
        class="ml-30 version-txt"
        :class="{ disabled: !currentVersion?.version }"
        v-text="versionTxt"
      ></span>
    </div>

    <div class="block mt-20">
      <span class="left-title">{{ $t('base.currentStatus') }}:</span>
      <div v-if="serverRunning" class="ml-30 status running">
        <span class="mr-10">{{ $t('base.runningStatus') }}</span>
        <yb-icon :svg="import('@/svg/task-start.svg?raw')" width="16" height="16" />
      </div>
      <div v-else class="ml-30 status">
        <span class="mr-10">{{ $t('base.noRunningStatus') }}</span>
        <yb-icon :svg="import('@/svg/task-stop.svg?raw')" width="16" height="16" />
      </div>
    </div>

    <div class="block mt-30">
      <el-button
        v-if="serverRunning"
        :loading="current_task === 'stop'"
        :disabled="disabled"
        @click="serviceDo('stop')"
        >{{ $t('base.serviceStop') }}</el-button
      >
      <el-button
        v-else
        :loading="current_task === 'start'"
        :disabled="disabled"
        @click="serviceDo('start')"
        >{{ $t('base.serviceStart') }}</el-button
      >
      <el-button
        :loading="current_task === 'restart'"
        :disabled="disabled"
        class="ml-30"
        @click="serviceDo('restart')"
        >{{ $t('base.serviceReStart') }}</el-button
      >
      <el-button
        v-if="showReloadBtn"
        :loading="current_task === 'reload'"
        :disabled="disabled || !serverRunning"
        class="ml-30"
        @click="serviceDo('reload')"
        >{{ $t('base.serviceReLoad') }}</el-button
      >
    </div>

    <ul class="logs mt-20">
      <template v-for="(log, index) in logs" :key="index">
        <li class="mb-5" v-html="log"></li>
      </template>
    </ul>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { reloadService, startService, stopService } from '@/util/Service'
  import { AppSofts, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { TaskStore } from '@/store/task'

  export default defineComponent({
    components: {},
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
        return this.typeFlag !== 'memcached' && this.typeFlag !== 'mongodb'
      },
      version() {
        const flag: keyof typeof AppSofts = this.typeFlag as any
        return AppStore().config.server[flag].current
      },
      currentVersion() {
        const flag: keyof typeof AppSofts = this.typeFlag as any
        return BrewStore()[flag].installed?.find(
          (i) => i.path === this?.version?.path && i.version === this?.version?.version
        )
      },
      currentTask() {
        const flag: keyof typeof AppSofts = this.typeFlag as any
        return TaskStore()[flag]
      },
      isRunning() {
        return this?.currentVersion?.running
      },
      logs() {
        return this.currentTask.log
      },
      serverRunning() {
        return this?.currentVersion?.run
      },
      disabled() {
        const flag: keyof typeof AppSofts = this.typeFlag as any
        return (
          BrewStore()[flag].installed?.some((i) => i.running) ||
          !this?.currentVersion?.version ||
          !this?.currentVersion?.path
        )
      },
      versionTxt() {
        const v = this?.currentVersion?.version
        const p = this?.currentVersion?.path
        if (v && p) {
          return `${v} - ${p}`
        }
        return this.$t('base.noVersionTips')
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
      serviceDo(flag: string) {
        if (!this?.currentVersion?.version || !this?.currentVersion?.path) {
          return
        }
        this.logs.splice(0)
        this.current_task = flag
        const typeFlag: keyof typeof AppSofts = this.typeFlag as any
        let action: any
        switch (flag) {
          case 'stop':
            action = stopService(typeFlag, this.currentVersion)
            break
          case 'start':
          case 'restart':
            action = startService(typeFlag, this.currentVersion)
            break
          case 'reload':
            action = reloadService(typeFlag, this.currentVersion)
            break
        }
        action.then((res: any) => {
          if (typeof res === 'string') {
            this.$message.error(res)
          } else {
            this.$message.success(this.$t('base.success'))
          }
        })
      }
    }
  })
</script>

<style lang="scss">
  .apache-service {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 40px 0 0 40px;
    .block {
      display: flex;
      flex-shrink: 0;

      > .left-title {
        flex-shrink: 0;
      }

      .version-txt.disabled {
        color: #f56c6c;
      }

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
        word-break: break-word;
      }
    }
  }
</style>
