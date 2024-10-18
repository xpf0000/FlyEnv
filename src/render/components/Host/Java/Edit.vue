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
        <div class="p-5 pt-2 flex items-center justify-center">
          <el-radio-group v-model="item.subType">
            <el-radio-button value="springboot" label="SpringBoot">
              <div class="min-w-20">SpringBoot</div>
            </el-radio-button>
            <el-radio-button value="other" label="Other">
              <div class="min-w-20">{{ I18nT('host.other') }}</div>
            </el-radio-button>
          </el-radio-group>
        </div>
        <div class="main">
          <input
            v-model.trim="item.name"
            type="text"
            :class="'input' + (errs['name'] ? ' error' : '')"
            :placeholder="I18nT('host.placeholderName')"
          />
          <textarea
            v-model.trim="item.alias"
            type="text"
            class="input-textarea"
            :placeholder="I18nT('host.placeholderAlias')"
          ></textarea>
          <input
            v-model.trim="item.mark"
            style="margin: 15px 0 10px"
            class="input"
            :placeholder="I18nT('host.placeholderRemarks')"
          />
        </div>

        <div class="plant-title">{{ I18nT('host.jarPackage') }}</div>
        <div class="main">
          <div class="path-choose pb-4">
            <input
              v-model.trim="item.jarDir"
              type="text"
              :class="'input' + (errs['jarDir'] ? ' error' : '')"
              :placeholder="I18nT('host.jarPackage')"
            />
            <div class="icon-block" @click="chooseRoot('jarDir')">
              <yb-icon
                :svg="import('@/svg/folder.svg?raw')"
                class="choose"
                width="18"
                height="18"
              />
            </div>
          </div>
        </div>

        <div class="plant-title">{{ I18nT('host.jdkPath') }}</div>
        <div class="main">
          <el-select v-model="item.jdkDir" class="w-full">
            <template v-for="(item, index) in jdks" :key="index">
              <el-option :label="`java${item.version}-${item.bin}`" :value="item.bin"></el-option>
            </template>
          </el-select>
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
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { passwordCheck } from '@/util/Brew'
  import { handleHost } from '@/util/Host'
  import { AppHost, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { merge } from 'lodash'
  import { MessageError } from '@/util/Element'
  import { execPromiseRoot } from '@shared/Exec'
  import installedVersions from '@/util/InstalledVersions'

  const { dialog } = require('@electron/remote')
  const { accessSync, constants } = require('fs')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    isEdit: boolean
    edit: any
  }>()
  const running = ref(false)
  const park = ref(false)
  const item = ref({
    id: new Date().getTime(),
    type: 'java',
    subType: 'springboot',
    envVarType: 'none',
    name: '',
    alias: '',
    mark: '',
    jarDir: '',
    jdkDir: '',
    startCommand: '',
    envVar: '',
    envFile: ''
  })
  const errs = ref({
    name: false,
    jarDir: false,
    jdkDir: false,
    startCommand: false
  })
  merge(item.value, props.edit)

  const appStore = AppStore()
  const brewStore = BrewStore()
  const hosts = computed(() => {
    return appStore.hosts
  })

  const jdks = computed(() => {
    return brewStore.module('java').installed ?? []
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

  const itemName = computed(() => {
    return item.value.name
  })

  watch(itemName, (name) => {
    for (let h of hosts.value) {
      if (h.name === name && h.id !== item.value.id) {
        errs.value['name'] = true
        break
      }
    }
  })

  watch(
    () => `${item.value.jarDir}-${item.value.jdkDir}`,
    () => {
      item.value.startCommand = `${item.value.jdkDir} -jar -Xmx1024M -Xms256M  ${item.value.jarDir}`
    }
  )

  const chooseRoot = (flag: 'jarDir' | 'envFile') => {
    const options: any = {}
    let opt = ['openFile', 'showHiddenFiles']
    options.properties = opt
    if (flag === 'jarDir') {
      if (item?.value?.jarDir) {
        options.defaultPath = item.value.jarDir
      }
      options.filters = [
        {
          extensions: ['jar']
        }
      ]
    } else if (flag === 'envFile' && item?.value?.envFile) {
      options.defaultPath = item.value.envFile
    }
    dialog.showOpenDialog(options).then(({ canceled, filePaths }: any) => {
      if (canceled || filePaths.length === 0) {
        return
      }
      const [path] = filePaths
      switch (flag) {
        case 'jarDir':
          item.value.jarDir = path
          break
        case 'envFile':
          item.value.envFile = path
          break
      }
    })
  }

  const checkItem = () => {
    errs.value['name'] = item.value.name.length === 0
    errs.value['jdkDir'] = item.value.jdkDir.length === 0
    errs.value['jarDir'] = item.value.jarDir.length === 0
    errs.value['startCommand'] = item.value.startCommand.length === 0

    for (let h of hosts.value) {
      if (h.name === item.value.name && h.id !== item.value.id) {
        errs.value['name'] = true
        break
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
      let flag: 'edit' | 'add' = props.isEdit ? 'edit' : 'add'
      let access = false
      try {
        accessSync('/private/etc/hosts', constants.R_OK | constants.W_OK)
        access = true
        console.log('可以读写')
      } catch (err) {
        console.error('无权访问')
      }
      passwordCheck().then(() => {
        if (!access) {
          execPromiseRoot(`chmod 777 /private/etc`.split(' '))
            .then(() => {
              return execPromiseRoot(`chmod 777 /private/etc/hosts`.split(' '))
            })
            .then(() => {
              handleHost(item.value as any, flag, props.edit as AppHost, park.value).then(() => {
                running.value = false
                show.value = false
              })
            })
            .catch(() => {
              MessageError(I18nT('base.hostNoRole'))
              running.value = false
            })
        } else {
          handleHost(item.value as any, flag, props.edit as AppHost, park.value).then(() => {
            running.value = false
            show.value = false
          })
        }
      })
    }
    saveFn()
  }

  if (jdks.value.length === 0) {
    brewStore.module('java').installedInited = false
    installedVersions.allInstalledVersions(['java']).then(() => {
      if (!item.value.jdkDir && jdks.value.length > 0) {
        const jdk = jdks.value[0]
        item.value.jdkDir = jdk.bin
      }
    })
  } else if (!item.value.jdkDir) {
    const jdk = jdks.value[0]
    item.value.jdkDir = jdk.bin
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
