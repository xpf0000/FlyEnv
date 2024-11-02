<template>
  <el-dialog
    v-model="show"
    :title="item?.user ? $t('base.edit') : $t('base.add')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <div class="main-wapper">
        <div class="main">
          <div class="path-choose mt-20 mb-20">
            <input
              v-model.trim="form.user"
              type="text"
              class="input"
              :readonly="item?.user || running || null"
              :class="{ error: errs?.user }"
              placeholder="username"
            />
          </div>
          <div class="path-choose mt-20 mb-20">
            <input
              v-model.trim="form.pass"
              type="text"
              :readonly="running || null"
              class="input"
              :class="{ error: errs?.pass }"
              placeholder="password"
            />
            <div class="icon-block" @click="makePass()">
              <yb-icon
                :svg="import('@/svg/icon_refresh.svg?raw')"
                class="choose"
                width="18"
                height="18"
              />
            </div>
          </div>
          <div class="path-choose mt-20 mb-20">
            <input
              type="text"
              class="input"
              :class="{ error: errs?.dir }"
              placeholder="root path"
              readonly=""
              :value="form.dir"
            />
            <div class="icon-block" @click="chooseRoot()">
              <yb-icon
                :svg="import('@/svg/folder.svg?raw')"
                class="choose"
                width="18"
                height="18"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button :disabled="running" @click="show = false">{{ $t('base.cancel') }}</el-button>
        <el-button :loading="running" :disabled="running" type="primary" @click="doSave">{{
          $t('base.confirm')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import IPC from '@/util/IPC'
  import { I18nT } from '@shared/lang'
  import type { FtpItem } from './ftp'
  import { FtpStore } from './ftp'
  import { uuid } from '@shared/utils'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { MessageError, MessageSuccess } from '@/util/Element'

  const { existsSync } = require('fs')
  const { dialog } = require('@electron/remote')
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: FtpItem
  }>()

  const appStore = AppStore()
  const brewStore = BrewStore()
  const ftpStore = FtpStore()
  const running = ref(false)
  const form = ref({
    user: '',
    pass: uuid(16),
    dir: ''
  })

  Object.assign(form.value, props.item)

  const errs = ref({
    user: false,
    pass: false,
    dir: false
  })

  const makePass = () => {
    if (running?.value) {
      return
    }
    form.value.pass = uuid(16)
  }

  watch(
    form,
    () => {
      let k: keyof typeof errs.value
      for (k in errs.value) {
        errs.value[k] = false
      }
    },
    {
      immediate: true,
      deep: true
    }
  )

  watch(
    () => form.value.user,
    (name) => {
      errs.value.user = false
      if (!props?.item?.user) {
        for (let h of ftpStore.allFtp) {
          if (h.user === name.trim()) {
            errs.value.user = true
            break
          }
        }
      }
      if (!name) {
        errs.value.user = true
      }
    }
  )

  const checkItem = () => {
    if (!props?.item?.user) {
      for (let h of ftpStore.allFtp) {
        if (h.user === form.value.user.trim()) {
          errs.value.user = true
          break
        }
      }
    }
    if (!form.value.user.trim()) {
      errs.value.user = true
    }
    errs.value.dir = form.value.dir.length === 0
    errs.value.pass = form.value.pass.length === 0

    let k: keyof typeof errs.value
    for (k in errs.value) {
      if (errs.value[k]) {
        return false
      }
    }
    return true
  }

  const chooseRoot = () => {
    if (running?.value) {
      return
    }
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        form.value.dir = path
      })
  }

  const doSave = () => {
    if (!checkItem() || running?.value) {
      return
    }
    if (form.value.dir && !existsSync(form.value.dir)) {
      MessageError(I18nT('base.ftpDirNotExists'))
      errs.value.dir = true
      return
    }
    running.value = true
    IPC.send('app-fork:pure-ftpd', 'addFtp', JSON.parse(JSON.stringify(form.value))).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          ftpStore.getPort()
          ftpStore.getAllFtp().then(() => {
            MessageSuccess(I18nT('base.success'))
            running.value = false
            show.value = false
          })
        } else if (res?.code === 1) {
          MessageError(res?.msg ?? I18nT('base.fail'))
          running.value = false
        }
      }
    )
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
