<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('util.toolSSL') }}</span>
        <slot name="like"></slot>
      </div>
      <el-button type="primary" class="shrink0" :loading="running" @click="doSave">
        {{ I18nT('base.generate') }}
      </el-button>
    </div>

    <div class="main-wapper">
      <div class="main">
        <textarea
          v-model.trim="item.domains"
          type="text"
          :class="'input-textarea' + (errs.domains ? ' error' : '')"
          placeholder="domains eg: *.xxx.com, One domain name per line"
        ></textarea>
        <div class="path-choose mt-20 mb-20">
          <input
            type="text"
            :class="'input' + (errs.root ? ' error' : '')"
            placeholder="Root CA certificate path, if not choose, will create new in SSL certificate save path"
            :value="item.root"
          />
          <div class="icon-block" @click="chooseRoot('root', true)">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>
        <div class="path-choose mt-20 mb-20">
          <input
            type="text"
            :class="'input' + (errs.savePath ? ' error' : '')"
            placeholder="SSL certificate save path"
            :value="item.savePath"
          />
          <div class="icon-block" @click="chooseRoot('save')">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import IPC from '@/util/IPC'
  import { I18nT } from '@lang/index'
  import { dialog, shell } from '@/util/NodeFn'

  const emit = defineEmits(['doClose'])

  const running = ref(false)
  const item = ref({
    domains: '',
    root: '',
    savePath: ''
  })

  const errs = ref<Record<string, boolean>>({
    domains: false,
    root: false,
    savePath: false
  })

  watch(
    item,
    () => {
      for (const k in errs.value) {
        errs.value[k] = false
      }
    },
    { deep: true, immediate: true }
  )

  const chooseRoot = (flag: string, choosefile = false) => {
    let opt = ['openDirectory', 'createDirectory']
    const filters = []
    if (choosefile) {
      opt = ['openFile']
      filters.push({ name: 'ROOT CA Certificate', extensions: ['crt'] })
    }

    dialog
      .showOpenDialog({
        properties: opt,
        filters: filters
      })
      .then(({ canceled, filePaths }) => {
        if (canceled || filePaths.length === 0) return

        const [path] = filePaths
        switch (flag) {
          case 'root':
            item.value.root = path
            break
          case 'save':
            item.value.savePath = path
            break
        }
      })
  }

  const checkItem = () => {
    errs.value.domains = item.value.domains.length === 0
    errs.value.savePath = item.value.savePath.length === 0

    return !Object.values(errs.value).some(Boolean)
  }

  const doSave = () => {
    if (!checkItem()) return

    running.value = true
    IPC.send('app-fork:tools', 'sslMake', JSON.parse(JSON.stringify(item.value))).then(
      (key: string, res: any) => {
        IPC.off(key)
        running.value = false
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.success'))
          shell.openPath(item.value.savePath)
          emit('doClose')
        } else {
          MessageError(I18nT('base.fail'))
        }
      }
    )
  }
</script>
