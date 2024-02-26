<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> PHP </span>
        </div>
        <el-button class="button" :disabled="service?.fetching" link @click="resetData">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': service?.fetching }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <el-table v-loading="service?.fetching" class="service-table" :data="versions">
      <el-table-column :label="$t('base.version')" prop="version" width="90px">
        <template #default="scope">
          <span>{{ scope.row.version }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('base.path')" :prop="null">
        <template #default="scope">
          <template v-if="!scope.row.version">
            <el-tooltip
              :raw-content="true"
              :content="scope.row?.error ?? $t('base.versionErrorTips')"
              popper-class="version-error-tips"
            >
              <span class="path error" @click.stop="openDir(scope.row.path)">{{
                scope.row.path
              }}</span>
            </el-tooltip>
          </template>
          <template v-else>
            <span class="path" @click.stop="openDir(scope.row.path)">{{ scope.row.path }}</span>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="$t('php.quickStart')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <el-button
            link
            class="status group-off"
            :class="{ off: appStore?.phpGroupStart?.[scope.row.bin] === false }"
            @click.stop="groupTrunOn(scope.row)"
          >
            <yb-icon
              style="width: 26px; height: 26px"
              :svg="import('@/svg/nogroupstart.svg?raw')"
            />
          </el-button>
        </template>
      </el-table-column>
      <el-table-column :label="$t('base.service')" :prop="null" width="100px">
        <template #default="scope">
          <template v-if="scope.row.running">
            <el-button :loading="true" link></el-button>
          </template>
          <template v-else>
            <template v-if="scope.row.run">
              <el-button link class="status running">
                <yb-icon :svg="import('@/svg/stop2.svg?raw')" @click.stop="doStop(scope.row)" />
              </el-button>
              <el-button link class="status refresh">
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  @click.stop="doRun(scope.row)"
                />
              </el-button>
            </template>
            <template v-else>
              <el-button link class="status start">
                <yb-icon :svg="import('@/svg/play.svg?raw')" @click.stop="doRun(scope.row)" />
              </el-button>
            </template>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="$t('base.operation')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <el-popover
            effect="dark"
            popper-class="host-list-poper"
            placement="bottom-end"
            :show-arrow="false"
            width="auto"
          >
            <ul v-poper-fix class="host-list-menu">
              <li @click.stop="action(scope.row, scope.$index, 'open')">
                <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.open') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'conf')">
                <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
                <span class="ml-15"> {{ $t('base.configFile') }} </span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'log-fpm')">
                <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('php.fpmLog') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'log-slow')">
                <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.slowLog') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'extend')">
                <yb-icon :svg="import('@/svg/extend.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('php.extension') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'groupstart')">
                <yb-icon
                  style="padding: 0"
                  :svg="import('@/svg/nogroupstart.svg?raw')"
                  width="18"
                  height="18"
                />
                <template v-if="appStore?.phpGroupStart?.[scope.row.bin] === false">
                  <span class="ml-10">{{ $t('php.groupStartOn') }}</span>
                </template>
                <template v-else>
                  <span class="ml-10">{{ $t('php.groupStartOff') }}</span>
                </template>
              </li>
              <template v-if="checkBrew(scope.row)">
                <li @click.stop="action(scope.row, scope.$index, 'brewLink')">
                  <yb-icon :svg="import('@/svg/link.svg?raw')" width="13" height="13" />
                  <span class="ml-15">{{ $t('php.phpSetGlobal') }}</span>
                </li>
              </template>
            </ul>
            <template #reference>
              <el-button link class="status">
                <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
              </el-button>
            </template>
          </el-popover>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
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
  import { Service } from '@/components/ServiceManager/service'

  const { shell } = require('@electron/remote')

  if (!Service.php) {
    Service.php = {
      fetching: false
    }
  }

  const initing = ref(false)
  const brewStore = BrewStore()
  const appStore = AppStore()

  const service = computed(() => {
    return Service.php
  })

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
    const key = item.bin
    const dict = appStore.phpGroupStart
    if (dict?.[key] === false) {
      dict[key] = true
      delete dict?.[key]
    } else {
      dict[key] = false
    }
    appStore.saveConfig()
  }

  let ExtensionsVM: any
  import('./Extends.vue').then((res) => {
    ExtensionsVM = res.default
  })

  const action = (item: SoftInstalled, index: number, flag: string) => {
    switch (flag) {
      case 'groupstart':
        groupTrunOn(item)
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

  const resetData = () => {
    if (service?.value?.fetching) {
      return
    }
    service.value.fetching = true
    const data = brewStore.php
    data.installedInited = false
    installedVersions.allInstalledVersions(['php']).then(() => {
      service.value.fetching = false
    })
  }

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }

  init()

  defineExpose({
    reinit
  })
</script>
