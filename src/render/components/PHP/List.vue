<template>
  <ul ref="fileDroper" class="php-versions-list">
    <li v-for="(item, key) in versions" :key="key" class="http-serve-item">
      <div class="left">
        <div class="title">
          <span class="name"> 路径:</span>
          <span class="url">版本:</span>
        </div>
        <div class="value">
          <span class="name">{{ item.path }} </span>
          <span class="url">{{ item.version }} </span>
        </div>
      </div>
      <div class="right">
        <template v-if="item.run">
          <div class="status running" :class="{ disabled: item.running }">
            <yb-icon :svg="import('@/svg/stop2.svg?raw')" @click.stop="doStop(item)" />
          </div>
          <div class="status refresh" :class="{ disabled: item.running }">
            <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" @click.stop="doRun(item)" />
          </div>
        </template>
        <div v-else class="status" :class="{ disabled: item.running }">
          <yb-icon :svg="import('@/svg/play.svg?raw')" @click.stop="doRun(item)" />
        </div>
        <el-popover
          :ref="'php-versions-poper-' + key"
          effect="dark"
          popper-class="host-list-poper"
          placement="bottom-end"
          width="150"
        >
          <ul v-poper-fix class="host-list-menu">
            <li @click.stop="action(item, key, 'open')">
              <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
              <span class="ml-15">打开路径</span>
            </li>
            <li @click.stop="action(item, key, 'conf')">
              <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
              <span class="ml-15"> 配置文件 </span>
            </li>
            <li @click.stop="action(item, key, 'log-fpm')">
              <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
              <span class="ml-15">FPM日志</span>
            </li>
            <li @click.stop="action(item, key, 'log-slow')">
              <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
              <span class="ml-15">慢日志</span>
            </li>
            <li @click.stop="action(item, key, 'extend')">
              <yb-icon :svg="import('@/svg/extend.svg?raw')" width="13" height="13" />
              <span class="ml-15">扩展</span>
            </li>
          </ul>

          <template #reference>
            <div class="more">
              <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
            </div>
          </template>
        </el-popover>
      </div>
    </li>
  </ul>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { startService, stopService } from '@/util/Service.js'
  import installedVersions from '@/util/InstalledVersions.js'
  const { shell } = require('@electron/remote')

  export default {
    components: {},
    props: {},
    data() {
      return {
        ondrop: false
      }
    },
    computed: {
      ...mapGetters('brew', {
        brewRunning: 'brewRunning',
        php: 'php'
      }),
      versions() {
        return this?.php?.installed ?? []
      },
      ...mapGetters('app', {
        stat: 'stat',
        setup: 'setup'
      }),
      customDirs() {
        return this.setup?.php?.dirs ?? []
      }
    },
    watch: {},
    created: function () {
      this.init()
    },
    mounted() {},
    unmounted() {},
    methods: {
      doRun(item) {
        startService('php', item).then((res) => {
          if (typeof res === 'string') {
            this.$message.error(res)
          } else {
            this.$message.success('操作成功')
          }
        })
      },
      doStop(item) {
        stopService('php', item).then((res) => {
          if (typeof res === 'string') {
            this.$message.error(res)
          } else {
            this.$message.success('操作成功')
          }
        })
      },
      action(item, index, flag) {
        switch (flag) {
          case 'open':
            shell.openPath(item.path)
            break
          case 'conf':
            import('./Config.vue').then((res) => {
              res.default
                .show({
                  version: item
                })
                .then()
            })
            break
          case 'log-fpm':
            import('./Logs.vue').then((res) => {
              res.default
                .show({
                  version: item,
                  type: 'php-fpm'
                })
                .then()
            })
            break
          case 'log-slow':
            import('./Logs.vue').then((res) => {
              res.default
                .show({
                  version: item,
                  type: 'php-fpm-slow'
                })
                .then()
            })
            break
          case 'extend':
            import('./Extends.vue').then((res) => {
              res.default
                .show({
                  version: item
                })
                .then()
            })
            break
        }
      },
      reinit() {
        const data = this.php
        data.installedInited = false
        this.init()
      },
      init() {
        if (this.initing) {
          return
        }
        this.initing = true
        installedVersions.allInstalledVersions('php').then(() => {
          this.initing = false
        })
      }
    }
  }
</script>

<style lang="scss">
  .confirm-del {
    background: #32364a !important;
    border: 1px solid #32364a !important;
    color: #fff !important;
    .el-message-box__message,
    .el-message-box__close {
      color: rgba(255, 255, 255, 0.7) !important;
    }
  }
  .php-versions-list {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: auto;

    .http-serve-item {
      flex-shrink: 0;
      display: flex;
      justify-content: space-between;
      padding: 0 40px;
      align-items: center;
      width: 100%;
      height: 120px;
      background: #32364a;
      border-radius: 8px;
      margin-bottom: 20px;

      .left {
        height: 100%;
        flex: 1;
        display: flex;
        padding-right: 40px;
        font-size: 15px;
        overflow: hidden;

        > .title {
          flex-shrink: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding-right: 20px;
          .url {
            margin-top: 10px;
          }
        }

        > .value {
          flex: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding-right: 20px;
          overflow: hidden;

          .url {
            margin-top: 10px;
            color: #409eff;

            &.empty {
              color: #fff;
              cursor: unset;
            }
          }
        }

        span {
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }
      }
      .right {
        flex-shrink: 0;
        display: flex;
        align-items: center;

        > div {
          display: flex;
          align-items: center;
          justify-content: center;

          &.running {
            svg {
              color: #01cc74;
            }
          }

          &.refresh {
            margin-left: 20px;

            svg {
              width: 23px;
              height: 23px;
            }
          }

          &.disabled {
            svg {
              color: #7c7c7c;
              cursor: not-allowed;
            }
          }
        }

        svg {
          width: 21px;
          height: 21px;
          cursor: pointer;

          &:hover {
            color: #fdab1f;
          }
        }

        .del {
          margin-left: 30px;
        }

        .more {
          margin-left: 30px;
        }
      }
    }

    > .empty {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;

      > .wapper {
        width: 70%;
        height: 70%;
        border: 2px dashed #ccc;
        border-radius: 10px;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        cursor: pointer;
        color: #fff;
        .icon {
          width: 100px;
          height: 100px;
          margin-bottom: 20px;
        }

        &.ondrop {
          border: 2px dashed #fdab1f;
          color: #fdab1f;

          .icon {
            color: #fdab1f;
          }
        }
      }
    }
  }
</style>
