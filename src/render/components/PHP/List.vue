<template>
  <ul ref="fileDroper" class="php-versions-list">
    <li v-if="!versions?.length" class="http-serve-item none">
      {{ $t('php.noVersionTips') }}
    </li>
    <li v-for="(item, key) in versions" :key="key" class="http-serve-item" :data-item-index="key">
      <div class="left">
        <div class="title">
          <span class="name"> {{ $t('base.path') }}:</span>
          <span class="url">{{ $t('base.version') }}:</span>
        </div>
        <div class="value">
          <span class="name">{{ item.path }} </span>
          <template v-if="item.version">
            <span class="url">{{ item.version }} </span>
          </template>
          <template v-else>
            <span class="url error">
              <el-tooltip
                :raw-content="true"
                :content="item?.error ?? $t('base.versionErrorTips')"
                popper-class="version-error-tips"
              >
                {{ $t('base.versionError') }}
              </el-tooltip>
            </span>
          </template>
        </div>
      </div>
      <div class="right">
        <template v-if="appStore.phpGroupStart[item.bin] === false">
          <div class="status group-off">
            <yb-icon :svg="import('@/svg/nogroupstart.svg?raw')" @click.stop="groupTrunOn(item)" />
          </div>
        </template>
        <template v-if="item.run">
          <div class="status running" :class="{ disabled: item.running }">
            <yb-icon :svg="import('@/svg/stop2.svg?raw')" @click.stop="doStop(item)" />
          </div>
          <div class="status refresh" :class="{ disabled: item.running }">
            <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" @click.stop="doRun(item)" />
          </div>
        </template>
        <div v-else class="status" :class="{ disabled: item.running || !item.version }">
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
              <span class="ml-15">{{ $t('base.open') }}</span>
            </li>
            <li @click.stop="action(item, key, 'conf')">
              <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
              <span class="ml-15"> {{ $t('base.configFile') }} </span>
            </li>
            <li @click.stop="action(item, key, 'log-fpm')">
              <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
              <span class="ml-15">{{ $t('php.fpmLog') }}</span>
            </li>
            <li @click.stop="action(item, key, 'log-slow')">
              <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
              <span class="ml-15">{{ $t('base.slowLog') }}</span>
            </li>
            <li @click.stop="action(item, key, 'extend')">
              <yb-icon :svg="import('@/svg/extend.svg?raw')" width="13" height="13" />
              <span class="ml-15">{{ $t('php.extension') }}</span>
            </li>
            <li @click.stop="action(item, key, 'groupstart')">
              <yb-icon
                style="padding: 0"
                :svg="import('@/svg/nogroupstart.svg?raw')"
                width="18"
                height="18"
              />
              <template v-if="appStore.phpGroupStart[item.bin] === false">
                <span class="ml-10">{{ $t('php.groupStartOn') }}</span>
              </template>
              <template v-else>
                <span class="ml-10">{{ $t('php.groupStartOff') }}</span>
              </template>
            </li>
            <template v-if="checkBrew(item)">
              <li @click.stop="action(item, key, 'brewLink')">
                <yb-icon :svg="import('@/svg/link.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('php.phpSetGlobal') }}</span>
              </li>
            </template>
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

<script lang="ts" setup>
  import { ref, computed } from 'vue'
  import { startService, stopService } from '@/util/Service'
  import installedVersions from '@/util/InstalledVersions'
  import IPC from '@/util/IPC'
  import { BrewStore, SoftInstalled } from '@/store/brew'
  import { ElLoading } from 'element-plus'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { AppStore } from '@/store/app'
  import { MessageError, MessageSuccess } from '@/util/Element'

  const { shell } = require('@electron/remote')

  const initing = ref(false)
  const brewStore = BrewStore()
  const appStore = AppStore()

  const php = computed(() => {
    return brewStore.php
  })
  const versions = computed(() => {
    return brewStore?.php?.installed ?? []
  })

  const init = () => {
    if (initing.value) {
      return
    }
    initing.value = true
    installedVersions.allInstalledVersions(['php']).then(() => {
      initing.value = false
    })
  }

  const reinit = () => {
    const data = php.value
    data.installedInited = false
    init()
  }

  const checkBrew = (item: SoftInstalled) => {
    return !!global.Server.BrewCellar && item?.bin?.includes('/Cellar/')
  }

  const doRun = (item: SoftInstalled) => {
    if (!item?.version) {
      return
    }
    startService('php', item).then((res) => {
      if (typeof res === 'string') {
        MessageError(res)
      } else {
        MessageSuccess(I18nT('base.success'))
      }
    })
  }

  const doStop = (item: SoftInstalled) => {
    if (!item?.version) {
      return
    }
    stopService('php', item).then((res) => {
      if (typeof res === 'string') {
        MessageError(res)
      } else {
        MessageSuccess(I18nT('base.success'))
      }
    })
  }

  const groupTrunOn = (item: SoftInstalled) => {
    if (!item?.version) {
      return
    }
    appStore.phpGroupStart[item.bin] = true
    appStore.saveConfig()
  }

  let ExtensionsVM: any
  import('./Extends.vue').then((res) => {
    ExtensionsVM = res.default
  })

  const action = (item: SoftInstalled, index: number, flag: string) => {
    switch (flag) {
      case 'groupstart':
        const old = appStore.phpGroupStart[item.bin] ?? true
        appStore.phpGroupStart[item.bin] = !old
        appStore.saveConfig()
        break
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
        AsyncComponentShow(ExtensionsVM, {
          version: item
        }).then()
        break
      case 'brewLink':
        if (!checkBrew(item)) {
          return
        }
        const dom: HTMLElement = document.querySelector(`li[data-item-index="${index}"]`)!
        const loading = ElLoading.service({
          target: dom
        })
        IPC.send('app-fork:php', 'doLinkVersion', JSON.parse(JSON.stringify(item))).then(
          (key: string, res: any) => {
            IPC.off(key)
            loading.close()
            if (res?.code === 0) {
              MessageSuccess(I18nT('base.success'))
            } else {
              MessageError(res.msg)
            }
          }
        )
        break
    }
  }

  init()

  defineExpose({
    reinit
  })
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
    height: 100%;
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

            &.error {
              color: #f56c6c;
            }

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

          &.group-off {
            margin-right: 30px;
            svg {
              width: 30px !important;
              height: 30px !important;
              opacity: 0.7;
            }
          }

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
