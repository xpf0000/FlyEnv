<template>
  <el-drawer
    ref="host-edit-drawer"
    v-model="show"
    size="500px"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    class="host-edit-drawer"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-edit">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15">{{ isEdit ? I18nT('base.edit') : I18nT('base.add') }}</span>
        </div>
        <el-button :loading="running" :disabled="running" class="shrink0" @click="doSave">{{
          I18nT('base.save')
        }}</el-button>
      </div>

      <div class="main-wapper">
        <div class="main">
          <input
            v-model.trim="item.projectName"
            type="text"
            :class="'input mb-3' + (errs['projectName'] ? ' error' : '')"
            :placeholder="I18nT('host.projectName')"
          />
          <input
            v-model.trim="item.mark"
            style="margin: 15px 0 10px"
            class="input"
            :placeholder="I18nT('host.placeholderRemarks')"
          />
        </div>

        <div class="plant-title">{{ I18nT('host.startFile') }}</div>
        <div class="main">
          <div class="path-choose pb-4">
            <input
              v-model.trim="item.bin"
              type="text"
              :class="'input' + (errs['bin'] ? ' error' : '')"
              :placeholder="I18nT('host.startFile')"
            />
            <div class="icon-block" @click="chooseRoot('bin')">
              <yb-icon
                :svg="import('@/svg/folder.svg?raw')"
                class="choose"
                width="18"
                height="18"
              />
            </div>
          </div>
        </div>

        <div class="plant-title">{{ I18nT('host.runDirectory') }}</div>
        <div class="main">
          <div class="path-choose pb-4">
            <input
              v-model.trim="item.root"
              type="text"
              :class="'input' + (errs['root'] ? ' error' : '')"
              :placeholder="I18nT('host.runDirectory')"
            />
            <div class="icon-block" @click="chooseRoot('root')">
              <yb-icon
                :svg="import('@/svg/folder.svg?raw')"
                class="choose"
                width="18"
                height="18"
              />
            </div>
          </div>
        </div>

        <div class="plant-title">{{ I18nT('host.projectPort') }}</div>
        <div class="main">
          <div class="port-set mb-20">
            <input
              v-model.number="item.projectPort"
              type="number"
              class="input"
              :placeholder="I18nT('host.projectPort')"
            />
          </div>
        </div>

        <div class="plant-title">{{ I18nT('host.startCommand') }}</div>
        <div class="main">
          <textarea
            v-model.trim="item.startCommand"
            type="text"
            class="input-textarea"
            :class="{ error: !!errs['startCommand'] }"
            style="margin-top: 0"
            :placeholder="I18nT('host.startCommand')"
          ></textarea>
        </div>

        <div class="main mt-5">
          <div class="ssl-switch">
            <span>{{ I18nT('host.envVar') }}</span>
            <el-radio-group v-model="item.envVarType">
              <el-radio-button value="none" :label="I18nT('base.none')"> </el-radio-button>
              <el-radio-button value="specify" :label="I18nT('host.specifyVar')"> </el-radio-button>
              <el-radio-button value="file" :label="I18nT('host.fileVar')"> </el-radio-button>
            </el-radio-group>
          </div>

          <div v-if="item.envVarType === 'specify'" style="margin-top: 12px">
            <textarea
              v-model.trim="item.envVar"
              type="text"
              class="input-textarea w-full"
              style="margin-top: 12px"
              :placeholder="I18nT('host.envVarTips')"
            ></textarea>
          </div>
          <div v-else-if="item.envVarType === 'file'" class="path-choose pb-4">
            <input
              v-model.trim="item.envFile"
              type="text"
              class="mt-4 input"
              :placeholder="I18nT('host.fileVarTips')"
            />
            <div class="icon-block" @click="chooseRoot('envFile')">
              <yb-icon
                :svg="import('@/svg/folder.svg?raw')"
                class="choose"
                width="18"
                height="18"
              />
            </div>
          </div>
        </div>
        <div class="mt-7"></div>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { handleHost } from '@/util/Host'
  import { AppHost, AppStore } from '@/store/app'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { merge } from 'lodash'

  const { dialog } = require('@electron/remote')
  const { dirname, basename } = require('path')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    isEdit: boolean
    edit: any
  }>()
  const running = ref(false)
  const park = ref(false)
  const item = ref({
    id: new Date().getTime(),
    type: 'go',
    envVarType: 'none',
    projectName: '',
    root: '',
    name: '',
    alias: '',
    mark: '',
    bin: '',
    projectPort: undefined,
    startCommand: '',
    envVar: '',
    envFile: ''
  })
  const errs = ref({
    projectName: false,
    startCommand: false,
    bin: false,
    root: false
  })
  merge(item.value, props.edit)

  const appStore = AppStore()
  const hosts = computed(() => {
    return appStore.hosts
  })

  watch(
    item,
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
    () => item.value.projectName,
    (name) => {
      if (!name) {
        return
      }
      for (let h of hosts.value) {
        if (h?.projectName === name && h.id !== item.value.id) {
          errs.value['projectName'] = true
          break
        }
      }
    }
  )

  watch(
    () => item.value.bin,
    () => {
      item.value.startCommand = `./${basename(item.value.bin)}`
    }
  )

  const chooseRoot = (flag: 'bin' | 'envFile' | 'root') => {
    const options: any = {}
    let opt = ['openFile', 'showHiddenFiles']
    if (flag === 'root') {
      opt = ['openDirectory', 'createDirectory', 'showHiddenFiles']
    }
    options.properties = opt
    if (flag === 'envFile' && item?.value?.envFile) {
      options.defaultPath = item.value.envFile
    }
    dialog.showOpenDialog(options).then(({ canceled, filePaths }: any) => {
      if (canceled || filePaths.length === 0) {
        return
      }
      const [path] = filePaths
      switch (flag) {
        case 'bin':
          item.value.bin = path
          item.value.root = dirname(path)
          break
        case 'envFile':
          item.value.envFile = path
          break
        case 'root':
          item.value.root = path
          break
      }
    })
  }

  const checkItem = () => {
    errs.value['startCommand'] = item.value.startCommand.length === 0
    errs.value['projectName'] = item.value.projectName.length === 0
    errs.value['bin'] = item.value.bin.length === 0
    errs.value['root'] = item.value.root.length === 0
    if (item.value.projectName) {
      for (let h of hosts.value) {
        if (h?.projectName === item.value.projectName && h.id !== item.value.id) {
          errs.value['projectName'] = true
          break
        }
      }
    }

    let k: keyof typeof errs.value
    for (k in errs.value) {
      if (errs.value[k]) {
        return false
      }
    }
    return true
  }

  const doSave = () => {
    if (!checkItem()) {
      return
    }
    const saveFn = () => {
      running.value = true
      const flag: 'edit' | 'add' = props.isEdit ? 'edit' : 'add'
      const data = JSON.parse(JSON.stringify(item.value))
      handleHost(data, flag, props.edit as AppHost, park.value).then(() => {
        running.value = false
        show.value = false
      })
    }
    saveFn()
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
