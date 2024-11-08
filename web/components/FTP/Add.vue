<template>
  <el-dialog
    v-model="show"
    :title="item?.user ? I18nT('base.edit') : I18nT('base.add')"
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
              readonly="true"
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
        <el-button :disabled="running" @click="show = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button :loading="running" :disabled="running" type="primary" @click="doSave">{{
          I18nT('base.confirm')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { ref, watch } from 'vue'
  import { AsyncComponentSetup, uuid } from '@web/fn'
  import { I18nT } from '@shared/lang'
  import type { FtpItem } from './ftp'
  import { FtpStore } from './ftp'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: FtpItem
  }>()

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

  const chooseRoot = () => {}

  const doSave = () => {}

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
