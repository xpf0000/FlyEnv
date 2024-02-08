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
          :show-arrow="false"
          width="auto"
        >
          <ul class="host-list-menu">
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
  import { startService, stopService, AsyncComponentShow, waitTime } from '../../fn'
  import { BrewStore, SoftInstalled } from '../../store/brew'
  import { ElLoading, ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'
  import { AppStore } from '../../store/app'

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
    waitTime().then(() => {
      const data = php.value
      data.installedInited = true
      initing.value = false
    })
  }

  const reinit = () => {
    const data = php.value
    data.installedInited = false
    init()
  }

  const checkBrew = (item: SoftInstalled) => {
    return item?.bin?.includes('/Cellar/')
  }

  const doRun = (item: SoftInstalled) => {
    if (!item?.version) {
      return
    }
    startService('php', item).then((res) => {
      if (typeof res === 'string') {
        ElMessage.error(res)
      } else {
        ElMessage.success(I18nT('base.success'))
      }
    })
  }

  const doStop = (item: SoftInstalled) => {
    if (!item?.version) {
      return
    }
    stopService('php', item).then((res) => {
      if (typeof res === 'string') {
        ElMessage.error(res)
      } else {
        ElMessage.success(I18nT('base.success'))
      }
    })
  }

  let ExtensionsVM: any
  import('./Extends.vue').then((res) => {
    ExtensionsVM = res.default
  })

  const groupTrunOn = (item: SoftInstalled) => {
    if (!item?.version) {
      return
    }
    appStore.phpGroupStart[item.bin] = true
  }

  const action = (item: SoftInstalled, index: number, flag: string) => {
    switch (flag) {
      case 'groupstart':
        const old = appStore.phpGroupStart[item.bin] ?? true
        appStore.phpGroupStart[item.bin] = !old
        break
      case 'open':
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
        waitTime().then(() => {
          loading.close()
          ElMessage.success(I18nT('base.success'))
        })
        break
    }
  }

  init()

  defineExpose({
    reinit
  })
</script>
