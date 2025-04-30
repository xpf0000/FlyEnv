<template>
  <li
    v-if="showItem"
    class="non-draggable"
    :class="'non-draggable' + (currentPage === '/pure-ftpd' ? ' active' : '')"
    @click="doNav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 5px" :svg="import('@/svg/ftp.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">FTP</span>
    </div>

    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange"
    >
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { FtpStore } from './ftp'
  import { ServiceActionExtParam } from '@/util/Service'
  import { ElMessageBox } from 'element-plus'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import type { AllAppModule } from '@/core/type'
  import type { Action } from 'element-plus'

  const {
    showItem,
    serviceDisabled,
    serviceFetching,
    serviceRunning,
    currentPage,
    groupDo,
    switchChange,
    nav,
    stopNav
  } = AsideSetup('pure-ftpd')
  const ftpStore = FtpStore()
  const doNav = () => {
    nav()
      .then(() => {
        ftpStore.getIP()
        ftpStore.getPort()
        ftpStore.getAllFtp()
      })
      .catch()
  }

  ServiceActionExtParam['pure-ftpd'] = (typeFlag: AllAppModule, fn: string) => {
    return new Promise<any[]>((resolve, reject) => {
      const showPasswordTips = () => {
        ElMessageBox.prompt(I18nT('service.ftpdNeedPasswordToStart'), I18nT('host.warning'), {
          distinguishCancelAndClose: true,
          confirmButtonText: I18nT('base.confirm'),
          cancelButtonText: I18nT('nodejs.openIN') + ' ' + I18nT('nodejs.Terminal'),
          inputType: 'password',
          customClass: 'password-prompt',
          beforeClose: (action, instance, done) => {
            console.log('beforeClose: ', action)
            if (action === 'confirm') {
              if (instance.inputValue) {
                const pass = instance.inputValue
                IPC.send('app:password-check', pass).then((key: string, res: any) => {
                  IPC.off(key)
                  if (res?.code === 0) {
                    global.Server.Password = res?.data ?? pass
                    AppStore()
                      .initConfig()
                      .then(() => {
                        done && done()
                        resolve([])
                      })
                  } else {
                    instance.editorErrorMessage = res?.msg ?? I18nT('base.passwordError')
                  }
                })
              }
            } else if (action === 'cancel') {
              done()
              resolve([true])
            } else {
              done()
              reject(new Error('User Cancel Action'))
            }
          }
        })
          .then()
          .catch((action: Action) => {
            console.log('catch: ', action)
            if (action === 'cancel') {
              resolve([true])
            } else {
              reject(new Error('User Cancel Action'))
            }
          })
      }
      if (!global.Server.Password && fn === 'startService') {
        showPasswordTips()
      } else {
        resolve([])
      }
    })
  }

  AppServiceModule['pure-ftpd'] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
