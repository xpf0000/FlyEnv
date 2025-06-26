<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('util.toolPhpObfuscator') }}</span>
        <slot name="like"></slot>
      </div>
      <el-button type="primary" class="shrink0" :loading="running" @click="doSave">{{
        I18nT('base.generate')
      }}</el-button>
    </div>

    <div class="main-wapper">
      <div class="main">
        <div class="path-choose my-5">
          <el-select
            v-model="item.phpversion"
            class="w-full"
            :class="errs['phpversion'] ? ' error' : ''"
            :placeholder="I18nT('php.obfuscatorPhpVersion')"
          >
            <template v-for="(item, _index) in phpVersions" :key="_index">
              <el-option :value="item.path + '-' + item.version" :label="item.version"></el-option>
            </template>
          </el-select>
        </div>
        <div class="path-choose my-5">
          <input
            type="text"
            :class="'input' + (errs['src'] ? ' error' : '')"
            readonly="true"
            :placeholder="I18nT('php.obfuscatorSrc')"
            :value="item.src"
          />
          <div class="icon-block" @click="chooseSrc">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>
        <div class="path-choose my-5">
          <input
            type="text"
            :class="{
              input: true,
              error: errs['desc'],
              enable: descType !== ''
            }"
            readonly="true"
            :placeholder="I18nT('php.obfuscatorDesc')"
            :value="item.desc"
          />
          <div
            :class="{
              enable: descType !== ''
            }"
            class="icon-block"
            @click="chooseDesc"
          >
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>
        <div class="path-choose my-5">
          <el-button @click="showConfig = true">{{ I18nT('php.obfuscatorConfig') }}</el-button>
        </div>
      </div>
    </div>
  </div>
  <el-drawer
    ref="host-edit-drawer"
    v-model="showConfig"
    size="75%"
    :destroy-on-close="true"
    class="host-edit-drawer"
    :with-header="false"
  >
    <Config :custom-config="item.config" @do-close="configCallback"></Config>
  </el-drawer>
</template>

<script setup lang="ts">
  import { ref, computed, watch, nextTick } from 'vue'
  import { BrewStore } from '@/store/brew'
  import Config from './Config.vue'
  import IPC from '@/util/IPC'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { join } from '@/util/path-browserify'
  import { dialog, shell, fs } from '@/util/NodeFn'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'

  const running = ref(false)
  const showConfig = ref(false)
  const descType = ref('')

  const item = ref({
    phpversion: '',
    src: '',
    desc: '',
    config: ''
  })

  const errs = ref<Record<string, boolean>>({
    phpversion: false,
    src: false,
    desc: false
  })

  const phpVersions = computed(() => {
    return BrewStore()
      .module('php')
      .installed.filter((p) => p.enable && p.num && p?.num > 56)
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

  const configCallback = (config?: string) => {
    if (typeof config === 'string') {
      item.value.config = config
    }
    showConfig.value = false
  }

  const doSave = async () => {
    if (!checkItem() || running.value) {
      return
    }

    running.value = true
    const php = phpVersions.value.find((p) => `${p.path}-${p.version}` === item.value.phpversion)
    const bin = join(php!.path, 'bin/php')
    const params = JSON.parse(
      JSON.stringify({
        ...item.value,
        bin
      })
    )

    IPC.send('app-fork:php', 'doObfuscator', params).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        MessageSuccess(I18nT('base.success'))
        shell.showItemInFolder(item.value.desc)
      } else {
        const msg = res.msg
        import('./Logs.vue').then((res) => {
          AsyncComponentShow(res.default, {
            content: msg
          })
          nextTick().then(() => {
            MessageError(I18nT('base.fail'))
          })
        })
      }
      running.value = false
    })
  }

  const checkItem = () => {
    errs.value.phpversion = item.value.phpversion.length === 0
    errs.value.src = item.value.src.length === 0
    errs.value.desc =
      item.value.desc.length === 0 ||
      item.value.src === item.value.desc ||
      item.value.desc.includes(item.value.src)

    return !Object.values(errs.value).some(Boolean)
  }

  const chooseSrc = async () => {
    const opt = ['openDirectory', 'openFile', 'showHiddenFiles']
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: opt,
      filters: [
        {
          extensions: ['php']
        }
      ]
    })

    if (canceled || filePaths.length === 0) return

    const [path] = filePaths
    const state = await fs.stat(path)

    if (state.isDirectory()) {
      descType.value = 'dir'
    } else if (state.isFile()) {
      descType.value = 'file'
    } else {
      descType.value = ''
      return
    }

    item.value.src = path
    item.value.desc = ''
  }

  const chooseDesc = async () => {
    if (!descType.value) return

    if (descType.value === 'dir') {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory', 'showHiddenFiles', 'createDirectory']
      })

      if (canceled || filePaths.length === 0) return

      const [path] = filePaths
      item.value.desc = path
    } else {
      const opt = ['showHiddenFiles', 'createDirectory', 'showOverwriteConfirmation']
      const { canceled, filePath } = await dialog.showSaveDialog({
        properties: opt,
        filters: [
          {
            extensions: ['php']
          }
        ]
      })

      if (canceled || !filePath) return

      item.value.desc = filePath
    }
  }
</script>
