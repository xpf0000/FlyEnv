<template>
  <div class="redis-versions">
    <div class="block">
      <span>{{ $t('base.selectVersion') }}</span>
      <el-select v-model="current" :disabled="disabled" class="ml-30">
        <template v-for="(item, index) in versions" :key="index">
          <template v-if="!item?.version">
            <el-tooltip
              :raw-content="true"
              :content="item?.error ?? $t('base.versionErrorTips')"
              popper-class="version-error-tips"
            >
              <el-option
                :disabled="true"
                :label="$t('base.versionError') + ' - ' + item.path"
                :value="$t('base.versionError') + ' - ' + item.path"
              >
              </el-option>
            </el-tooltip>
          </template>
          <template v-else>
            <el-option
              :label="item?.version + ' - ' + item.path"
              :value="item?.version + ' - ' + item.path"
            >
            </el-option>
          </template>
        </template>
      </el-select>
      <el-button
        :disabled="disabled || current === currentVersion"
        class="ml-20"
        :loading="currentTask.running"
        @click="versionChange"
        >{{ $t('base.switch') }}</el-button
      >
      <el-button :disabled="initing || disabled" class="ml-20" :loading="initing" @click="reinit">{{
        $t('base.refresh')
      }}</el-button>
    </div>

    <ul id="logs" class="logs">
      <li v-for="(txt, index) in log" :key="index" class="mb-5" v-html="txt"></li>
    </ul>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import IPC from '@/util/IPC'
  import installedVersions from '@/util/InstalledVersions'
  import { BrewStore } from '@/store/brew'
  import { AppSofts, AppStore } from '@/store/app'
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
        current: '',
        initing: false
      }
    },
    computed: {
      brewRunning() {
        return BrewStore().brewRunning
      },
      server() {
        return AppStore().config.server
      },
      customDirs() {
        const flag: keyof typeof AppSofts = this.typeFlag as any
        return AppStore().config.setup[flag].dirs
      },
      versions() {
        const flag: keyof typeof AppSofts = this.typeFlag as any
        return BrewStore()[flag].installed
      },
      disabled() {
        return this.brewRunning || this.taskRunning
      },
      taskRunning() {
        return this.versions.some((v) => v.running)
      },
      currentTask() {
        const flag: keyof typeof AppSofts = this.typeFlag as any
        return TaskStore()[flag]
      },
      log() {
        return this.currentTask.log
      },
      logLength() {
        return this.log.length
      },
      version() {
        if (!this.typeFlag) {
          return {}
        }
        const flag: keyof typeof AppSofts = this.typeFlag as any
        return this.server?.[flag]?.current ?? {}
      },
      currentVersion() {
        if (this.version?.version) {
          const v = this.version.version
          const p = this.version.path
          return `${v} - ${p}`
        }
        return ''
      }
    },
    watch: {
      logLength() {
        this.$nextTick(() => {
          let container = this.$el.querySelector('#logs')
          if (container) {
            container.scrollTop = container.scrollHeight
          }
        })
      },
      server: {
        handler(v) {
          console.log('Switch watch server: ', v)
        },
        deep: true
      }
    },
    created: function () {
      if (!this.taskRunning) {
        this.log.splice(0)
      }
      this.getCurrenVersion()
      this.init()
    },
    mounted() {
      console.log('Switch mounted server: ', this.server)
    },
    methods: {
      reinit() {
        const flag: keyof typeof AppSofts = this.typeFlag as any
        const data = BrewStore()[flag]
        data.installedInited = false
        this.init()
      },
      init() {
        if (this.initing) {
          return
        }
        this.initing = true
        const flag: keyof typeof AppSofts = this.typeFlag as any
        installedVersions.allInstalledVersions([flag]).then(() => {
          this.initing = false
        })
      },
      getCurrenVersion() {
        this.current = this.currentVersion
      },
      versionChange() {
        if (this.current === this.currentVersion) {
          return
        }
        this.log.splice(0)
        let data = this.versions.find((v) => {
          const txt = `${v.version} - ${v.path}`
          return txt === this.current
        })!
        data.run = false
        data.running = true
        const param = JSON.parse(JSON.stringify(data))
        IPC.send(`app-fork:${this.typeFlag}`, 'switchVersion', param).then(
          (key: string, res: any) => {
            if (res.code === 0) {
              IPC.off(key)
              const appStore = AppStore()
              const flag: keyof typeof AppSofts = this.typeFlag as any
              appStore.UPDATE_SERVER_CURRENT({
                flag: flag,
                data: param
              })
              appStore.saveConfig()
              this.$message.success(this.$t('base.success'))
              data.run = true
              data.running = false
            } else if (res.code === 1) {
              IPC.off(key)
              this.$message.error(this.$t('base.fail'))
              data.running = false
            } else if (res.code === 200) {
              this.log.push(res.msg)
            }
          }
        )
      }
    }
  })
</script>

<style lang="scss">
  .redis-versions {
    display: flex;
    flex-direction: column;
    height: 100%;
    .block {
      display: flex;
      align-items: center;
      margin: 40px 0 30px 40px;
      flex-shrink: 0;
    }
    .logs {
      padding-left: 40px;
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
