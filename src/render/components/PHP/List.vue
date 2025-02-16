<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> PHP </span>
          <el-popover :show-after="600" placement="top" width="auto">
            <template #default>
              <span>{{ I18nT('base.customVersionDir') }}</span>
            </template>
            <template #reference>
              <el-button
                class="custom-folder-add-btn"
                :icon="FolderAdd"
                link
                @click.stop="showCustomDir"
              ></el-button>
            </template>
          </el-popover>
          <el-popover :show-after="600" placement="top" width="auto">
            <template #default>
              <span>{{ I18nT('base.showHideTips') }}</span>
            </template>
            <template #reference>
              <template v-if="isShowHide">
                <el-button link style="padding: 0" @click.stop="isShowHide = false">
                  <yb-icon
                    :svg="import('@/svg/show.svg?raw')"
                    style="width: 24px; height: 24px; color: #409eff"
                  ></yb-icon>
                </el-button>
              </template>
              <template v-else>
                <el-button link style="padding: 0" @click.stop="isShowHide = true">
                  <yb-icon
                    :svg="import('@/svg/hide.svg?raw')"
                    style="width: 23px; height: 23px"
                  ></yb-icon>
                </el-button>
              </template>
            </template>
          </el-popover>
          <el-button link @click="openUrl('http://pecl.php.net/')"> Pecl </el-button>
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
      <el-table-column prop="version" width="140px">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            I18nT('base.version')
          }}</span>
        </template>
        <template #default="scope">
          <span style="padding: 2px 12px 2px 24px; display: block">{{ scope.row.version }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.path')" :prop="null">
        <template #default="scope">
          <template v-if="!scope.row.version">
            <el-popover popper-class="version-error-tips" width="auto" placement="top">
              <template #reference>
                <span class="path error" @click.stop="openDir(scope.row.path)">{{
                  scope.row.path
                }}</span>
              </template>
              <template #default>
                <span>{{ scope.row?.error ?? I18nT('base.versionErrorTips') }}</span>
              </template>
            </el-popover>
          </template>
          <template v-else>
            <span class="path" @click.stop="openDir(scope.row.path)">{{ scope.row.path }}</span>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('php.quickStart')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <el-button
            link
            class="status group-off"
            :class="{ off: appStore?.phpGroupStart?.[scope.row.bin] === false }"
            @click.stop="groupTrunOn(scope.row)"
          >
            <yb-icon
              style="width: 30px; height: 30px"
              :svg="import('@/svg/nogroupstart.svg?raw')"
            />
          </el-button>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('service.env')" :prop="null" width="100px" align="center">
        <template #header>
          <el-tooltip :content="I18nT('service.envTips')" placement="top" show-after="600">
            <span>{{ I18nT('service.env') }}</span>
          </el-tooltip>
        </template>
        <template #default="scope">
          <template v-if="ServiceActionStore.pathSeting[scope.row.bin]">
            <el-button style="width: auto; height: auto" text :loading="true"></el-button>
          </template>
          <template v-else-if="isInAppEnv(scope.row)">
            <el-tooltip :content="I18nT('service.setByApp')" :show-after="600" placement="top">
              <el-button link type="primary" @click.stop="ServiceActionStore.updatePath(scope.row, 'php')">
                <yb-icon :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
              </el-button>
            </el-tooltip>
          </template>
          <template v-else-if="isInEnv(scope.row)">
            <el-tooltip :content="I18nT('service.setByNoApp')" :show-after="600" placement="top">
              <el-button link type="warning" @click.stop="ServiceActionStore.updatePath(scope.row, 'php')">
                <yb-icon :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
              </el-button>
            </el-tooltip>
          </template>
          <template v-else>
            <el-button class="current-set row-hover-show" link @click.stop="ServiceActionStore.updatePath(scope.row, 'php')">
              <yb-icon class="current-not" :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
            </el-button>
          </template>
        </template>
      </el-table-column>
      <el-table-column
        :show-overflow-tooltip="true"
        :label="I18nT('service.alias')"
        :prop="null"
        width="120px"
        align="left"
      >
        <template #header>
          <el-tooltip :content="I18nT('service.aliasTips')" placement="top" show-after="600">
            <span>{{ I18nT('service.alias') }}</span>
          </el-tooltip>
        </template>
        <template #default="scope">
          <div class="flex items-center h-full min-h-9"
            ><span class="truncate">{{
              appStore.config.setup.alias?.[scope.row.bin]?.map((a: any) => a.name)?.join(',')
            }}</span></div
          >
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.service')" :prop="null" width="100px">
        <template #default="scope">
          <template v-if="excludeLocalVersion.includes(scope.row.bin)">
            <el-button link @click.stop="doShow(scope.row)">
              <yb-icon
                :svg="import('@/svg/hide.svg?raw')"
                style="width: 24px; height: 24px"
                :class="{ 'fa-spin': service?.fetching }"
              ></yb-icon>
            </el-button>
          </template>
          <template v-else>
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
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.operation')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <el-popover
            effect="dark"
            popper-class="host-list-poper"
            placement="bottom-end"
            :show-arrow="false"
            width="auto"
            @show="onPoperShow"
          >
            <ul v-poper-fix class="host-list-menu">
              <li @click.stop="action(scope.row, scope.$index, 'open')">
                <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ I18nT('base.open') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'conf')">
                <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
                <span class="ml-15"> php.ini </span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'extend')">
                <yb-icon :svg="import('@/svg/extend.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ I18nT('php.extension') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'groupstart')">
                <yb-icon
                  style="padding: 0"
                  :svg="import('@/svg/nogroupstart.svg?raw')"
                  width="18"
                  height="18"
                />
                <template v-if="appStore?.phpGroupStart?.[scope.row.bin] === false">
                  <span class="ml-10">{{ I18nT('php.groupStartOn') }}</span>
                </template>
                <template v-else>
                  <span class="ml-10">{{ I18nT('php.groupStartOff') }}</span>
                </template>
              </li>
              <li
                class="path-set"
                :class="pathState(scope.row)"
                @click.stop="pathChange(scope.row)"
              >
                <template v-if="pathLoading(scope.row)">
                  <el-button style="width: auto; height: auto" text :loading="true"></el-button>
                </template>
                <template v-else>
                  <yb-icon
                    class="current"
                    :class="{
                      'text-blue-500': isInAppEnv(scope.row),
                      'opacity-100': isInAppEnv(scope.row)
                    }"
                    :svg="import('@/svg/select.svg?raw')"
                    width="17"
                    height="17"
                  />
                </template>
                <span class="ml-15">{{ I18nT('base.addToPath') }}</span>
              </li>
              <li @click.stop="ServiceActionStore.showAlias(scope.row)">
                <yb-icon
                  class="current"
                  :svg="import('@/svg/aliase.svg?raw')"
                  width="17"
                  height="17"
                />
                <span class="ml-15">{{ I18nT('service.setaliase') }}</span>
              </li>
              <template v-if="isVersionHide(scope.row)">
                <li @click.stop="doShow(scope.row)">
                  <yb-icon :svg="import('@/svg/show.svg?raw')" width="17" height="17" />
                  <span class="ml-15">{{ I18nT('base.noHide') }}</span>
                </li>
              </template>
              <template v-else>
                <li @click.stop="doHide(scope.row)">
                  <yb-icon :svg="import('@/svg/hide.svg?raw')" width="17" height="17" />
                  <span class="ml-15">{{ I18nT('base.hide') }}</span>
                </li>
              </template>
              <li @click.stop="ServiceActionStore.delVersion(scope.row, 'php')">
                <yb-icon :svg="import('@/svg/trash.svg?raw')" width="17" height="17" />
                <span class="ml-15">{{ I18nT('base.del') }}</span>
              </li>
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
  import { ref, computed, reactive } from 'vue'
  import { startService, stopService } from '@/util/Service'
  import installedVersions from '@/util/InstalledVersions'
  import { BrewStore, SoftInstalled } from '@/store/brew'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { AppStore } from '@/store/app'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { Service } from '@/components/ServiceManager/service'
  import { FolderAdd } from '@element-plus/icons-vue'
  import { ServiceActionStore } from '../ServiceManager/EXT/store'

  const { shell } = require('@electron/remote')
  const { join, dirname } = require('path')

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
    return brewStore.module('php')
  })
  const versions = computed(() => {
    if (!isShowHide?.value) {
      return brewStore
        ?.module('php')
        ?.installed?.filter((i) => !excludeLocalVersion.value.includes(i.bin))
    }
    return brewStore.module('php')?.installed ?? []
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

  const onPoperShow = () => {
    ServiceActionStore.fetchPath()
  }

  const pathLoading = (item: SoftInstalled) => {
    return ServiceActionStore.pathSeting?.[item.bin] ?? false
  }

  const excludeLocalVersion = computed(() => {
    return appStore.config.setup.excludeLocalVersion ?? []
  })

  const isVersionHide = (item: SoftInstalled) => {
    return excludeLocalVersion?.value?.includes(item.bin)
  }

  const doShow = (item: SoftInstalled) => {
    appStore.serviceShow(item.bin)
  }

  const isInAppEnv = (item: SoftInstalled) => {
    return ServiceActionStore.appPath.includes(item.path)
  }

  const isInEnv = (item: SoftInstalled) => {
    return ServiceActionStore.allPath.includes(item.path)
  }

  const doHide = (item: SoftInstalled) => {
    appStore.serviceHide(item.bin)
    if (item?.run) {
      stopService('php', item)
    }
  }

  const pathState = (item: SoftInstalled) => {
    if (ServiceActionStore.allPath.length === 0) {
      return ''
    }

    return ServiceActionStore.allPath.includes(dirname(item.bin)) ? 'seted' : 'noset'
  }

  const isShowHide = computed({
    get() {
      return appStore?.config?.setup?.serviceShowHide?.php ?? false
    },
    set(v) {
      appStore.serviceShowHide('php', v)
    }
  })

  const pathChange = (item: SoftInstalled) => {
    ServiceActionStore.updatePath(item, 'php').then().catch()
  }

  const reinit = () => {
    const data = php.value
    data.installedInited = false
    init()
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
    const dict = JSON.parse(JSON.stringify(appStore.phpGroupStart))
    const key = item.bin
    if (dict?.[key] === false) {
      dict[key] = true
      delete dict?.[key]
    } else {
      dict[key] = false
    }
    appStore.config.setup.phpGroupStart = reactive(dict)
    appStore.saveConfig()
  }

  let ConfVM: any
  import('./Config.vue').then((res) => {
    ConfVM = res.default
  })

  let ExtensionVM: any
  import('./Extends.vue').then((res) => {
    ExtensionVM = res.default
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
        AsyncComponentShow(ConfVM, {
          version: item
        }).then()
        break
      case 'extend':
        console.log('extend: ', item, index)
        AsyncComponentShow(ExtensionVM, {
          version: item
        }).then()
        // const dir = join(item.path, 'ext')
        // shell.openPath(dir)
        // shell.openExternal('http://pecl.php.net/')
        break
      case 'brewLink':
        break
    }
  }

  const openUrl = (url: string) => {
    shell.openExternal(url)
  }

  const resetData = () => {
    if (service?.value?.fetching) {
      return
    }
    service.value.fetching = true
    const data = brewStore.module('php')
    data.installedInited = false
    installedVersions.allInstalledVersions(['php']).then(() => {
      service.value.fetching = false
    })
  }

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }

  init()

  let CustomPathVM: any
  import('@/components/ServiceManager/customPath.vue').then((res) => {
    CustomPathVM = res.default
  })

  const showCustomDir = () => {
    AsyncComponentShow(CustomPathVM, {
      flag: 'php'
    }).then((res) => {
      if (res) {
        console.log('showCustomDir chagned !!!')
        resetData()
      }
    })
  }

  defineExpose({
    reinit
  })
</script>
