<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> Python </span>
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
          <span
            :class="{
              current: checkEnvPath(scope.row)
            }"
            style="padding: 2px 12px 2px 24px; display: block"
            >{{ scope.row.version }}</span
          >
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
            <span
              class="path"
              :class="{
                current: checkEnvPath(scope.row)
              }"
              @click.stop="openDir(scope.row.path)"
              >{{ scope.row.path }}</span
            >
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.operation')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <el-popover
            effect="dark"
            popper-class="host-list-poper"
            placement="left-start"
            :show-arrow="false"
            width="auto"
            @before-enter="onPoperShow"
          >
            <ul v-poper-fix class="host-list-menu">
              <li
                v-loading="pathLoading(scope.row)"
                class="path-set"
                :class="pathState(scope.row)"
                @click.stop="pathChange(scope.row)"
              >
                <yb-icon
                  class="current"
                  :svg="import('@/svg/select.svg?raw')"
                  width="17"
                  height="17"
                />
                <span class="ml-15">{{ I18nT('base.addToPath') }}</span>
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
  import { ref, computed } from 'vue'
  import installedVersions from '@/util/InstalledVersions'
  import { BrewStore, SoftInstalled } from '@/store/brew'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { Service } from '@/components/ServiceManager/service'
  import { FolderAdd } from '@element-plus/icons-vue'
  import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
  import { I18nT } from '@shared/lang'

  const { shell } = require('@electron/remote')
  const { dirname } = require('path')

  if (!Service.python) {
    Service.python = {
      fetching: false
    }
  }

  const initing = ref(false)
  const brewStore = BrewStore()

  const onPoperShow = () => {
    ServiceActionStore.fetchPath()
  }

  const pathLoading = (item: SoftInstalled) => {
    return ServiceActionStore.pathSeting?.[item.bin] ?? false
  }

  const pathState = (item: SoftInstalled) => {
    if (ServiceActionStore.allPath.length === 0) {
      return ''
    }
    const bin = dirname(item.bin)
    return ServiceActionStore.allPath.includes(bin) ? 'seted' : 'noset'
  }

  const pathChange = (item: SoftInstalled) => {
    ServiceActionStore.updatePath(item, 'python')
  }

  const checkEnvPath = (item: SoftInstalled) => {
    return ServiceActionStore.allPath.includes(dirname(item.bin))
  }

  const service = computed(() => {
    return Service.python
  })

  const python = computed(() => {
    return brewStore.module('python')
  })
  const versions = computed(() => {
    return brewStore.module('python').installed
  })

  const init = () => {
    if (initing.value) {
      return
    }
    initing.value = true
    service.value.fetching = true
    installedVersions.allInstalledVersions(['python']).then(() => {
      initing.value = false
      service.value.fetching = false
    })
  }

  const reinit = () => {
    const data = python.value
    data.installedInited = false
    init()
  }

  const resetData = () => {
    if (service?.value?.fetching) {
      return
    }
    service.value.fetching = true
    const data = brewStore.module('python')
    data.installedInited = false
    installedVersions.allInstalledVersions(['python']).then(() => {
      service.value.fetching = false
    })
  }

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }

  init()
  ServiceActionStore.fetchPath()

  let CustomPathVM: any
  import('@/components/ServiceManager/customPath.vue').then((res) => {
    CustomPathVM = res.default
  })

  const showCustomDir = () => {
    AsyncComponentShow(CustomPathVM, {
      flag: 'python'
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
