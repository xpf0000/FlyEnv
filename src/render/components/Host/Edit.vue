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
          <span class="ml-15">{{ isEdit ? $t('base.edit') : $t('base.add') }}</span>
        </div>
        <el-button :loading="running" :disabled="running" class="shrink0" @click="doSave">{{
          $t('base.save')
        }}</el-button>
      </div>

      <div class="main-wapper">
        <div class="main">
          <input
            v-model.trim="item.name"
            type="text"
            :class="'input' + (errs['name'] ? ' error' : '')"
            :placeholder="$t('host.placeholderName')"
          />
          <textarea
            v-model.trim="item.alias"
            type="text"
            class="input-textarea"
            :placeholder="$t('host.placeholderAlias')"
          ></textarea>
          <input
            v-model.trim="item.mark"
            style="margin: 15px 0 10px"
            class="input"
            :placeholder="$t('host.placeholderRemarks')"
          />
          <div class="path-choose mt-20 mb-20">
            <input
              type="text"
              :class="'input' + (errs['root'] ? ' error' : '')"
              :placeholder="$t('host.placeholderRootPath')"
              :value="item.root"
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
          <div class="park">
            <div class="title">
              <span>{{ $t('base.parkTitle') }}</span>
              <el-popover placement="top" trigger="hover" width="auto">
                <template #reference>
                  <yb-icon
                    :svg="import('@/svg/question.svg?raw')"
                    width="12"
                    height="12"
                    style="margin-left: 5px"
                  ></yb-icon>
                </template>
                <template #default>
                  <p>
                    {{ $t('base.parkTips') }}
                  </p>
                </template>
              </el-popover>
            </div>
            <el-switch v-model="park" :before-change="onParkChange"></el-switch>
          </div>
        </div>

        <div class="plant-title">{{ $t('base.phpVersion') }}</div>
        <div class="main">
          <div class="port-set">
            <el-select
              v-model="item.phpVersion"
              class="w-p100"
              :placeholder="$t('base.selectPhpVersion')"
            >
              <el-option :value="undefined" :label="$t('host.staticSite')"></el-option>
              <template v-for="(v, i) in phpVersions" :key="i">
                <el-option :value="v.num" :label="v.num"></el-option>
              </template>
            </el-select>
          </div>
        </div>

        <div class="plant-title">{{ $t('host.hostPort') }}</div>
        <div class="main">
          <div class="port-set mb-20">
            <div class="port-type"> Nginx </div>
            <input
              v-model.number="item.port.nginx"
              type="number"
              :class="'input' + (errs['port_nginx'] ? ' error' : '')"
              placeholder="default: 80"
            />
          </div>

          <div class="port-set mb-20">
            <div class="port-type"> Caddy </div>
            <input
              v-model.number="item.port.caddy"
              type="number"
              :class="'input' + (errs['port_caddy'] ? ' error' : '')"
              placeholder="default: 80"
            />
          </div>

          <div class="port-set mb-20">
            <div class="port-type"> Apache </div>
            <input
              v-model.number="item.port.apache"
              type="number"
              :class="'input' + (errs['port_apache'] ? ' error' : '')"
              placeholder="default: 80"
            />
          </div>
        </div>

        <div class="plant-title">{{ $t('host.hostSSL') }}</div>

        <div class="main">
          <div class="ssl-switch">
            <span>SSL</span>
            <el-switch v-model="item.useSSL"></el-switch>
          </div>

          <div v-if="item.useSSL" class="ssl-switch" style="margin-top: 12px">
            <span>{{ $t('host.autoSSL') }}</span>
            <el-switch v-model="item.autoSSL"></el-switch>
          </div>

          <template v-if="item.useSSL && !item.autoSSL">
            <div class="path-choose mt-20">
              <input
                type="text"
                :class="'input' + (errs['cert'] ? ' error' : '')"
                placeholder="cert"
                :value="item.ssl.cert"
              />
              <div class="icon-block" @click="chooseRoot('cert', true)">
                <yb-icon
                  :svg="import('@/svg/folder.svg?raw')"
                  class="choose"
                  width="18"
                  height="18"
                />
              </div>
            </div>

            <div class="path-choose mt-20 mb-20">
              <input
                type="text"
                :class="'input' + (errs['certkey'] ? ' error' : '')"
                placeholder="cert key"
                :value="item.ssl.key"
              />
              <div class="icon-block" @click="chooseRoot('certkey', true)">
                <yb-icon
                  :svg="import('@/svg/folder.svg?raw')"
                  class="choose"
                  width="18"
                  height="18"
                />
              </div>
            </div>
          </template>

          <template v-if="item.useSSL">
            <div class="ssl-switch mb-20 mt-20">
              <span>Port</span>
            </div>
            <div class="port-set port-ssl mb-20">
              <div class="port-type"> Nginx </div>
              <input
                v-model.number="item.port.nginx_ssl"
                type="number"
                :class="'input' + (errs['port_nginx_ssl'] ? ' error' : '')"
                placeholder="default: 443"
              />
            </div>
            <div class="port-set port-ssl mb-20">
              <div class="port-type"> Caddy </div>
              <input
                v-model.number="item.port.caddy_ssl"
                type="number"
                :class="'input' + (errs['port_caddy_ssl'] ? ' error' : '')"
                placeholder="default: 443"
              />
            </div>
            <div class="port-set port-ssl mb-20">
              <div class="port-type"> Apache </div>
              <input
                v-model.number="item.port.apache_ssl"
                type="number"
                :class="'input' + (errs['port_apache_ssl'] ? ' error' : '')"
                placeholder="default: 443"
              />
            </div>
          </template>
        </div>

        <div class="plant-title flex justify-between items-center">
          <div class="flex items-center">
            <span>Nginx Url Rewrite</span>
            <el-popover placement="top" :title="$t('base.attention')" width="auto" trigger="hover">
              <template #reference>
                <yb-icon
                  :svg="import('@/svg/question.svg?raw')"
                  width="12"
                  height="12"
                  style="margin-left: 5px"
                ></yb-icon>
              </template>
              <p>{{ $t('base.nginxRewriteTips') }}</p>
            </el-popover>
          </div>
        </div>

        <div class="main">
          <el-select
            v-model="rewriteKey"
            filterable
            :placeholder="$t('base.commonTemplates')"
            class="w-p100"
            @change="rewriteChange"
          >
            <el-option v-for="key in rewrites" :key="key" :label="key" :value="key"> </el-option>
          </el-select>

          <div ref="input" class="input-textarea nginx-rewrite"></div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, nextTick, ref, watch, Ref, onMounted, onUnmounted } from 'vue'
  import { getAllFileAsync, readFileAsync } from '@shared/file'
  import { handleHost } from '@/util/Host'
  import { AppHost, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { I18nT } from '@shared/lang'
  import Base from '@/core/Base'
  import { RewriteAll } from '@/components/Host/store'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { merge } from 'lodash'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor'
  import { ElMessageBox } from 'element-plus'
  import IPC from '@/util/IPC'
  import { Plus } from '@element-plus/icons-vue'

  const { dialog, shell } = require('@electron/remote')
  const { join } = require('path')
  const { existsSync, mkdirp } = require('fs-extra')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    isEdit: boolean
    edit: any
  }>()
  const input = ref()
  const running = ref(false)
  const park = ref(false)
  const item = ref({
    id: new Date().getTime(),
    name: '',
    alias: '',
    useSSL: false,
    autoSSL: false,
    ssl: {
      cert: '',
      key: ''
    },
    port: {
      nginx: 80,
      nginx_ssl: 443,
      apache: 80,
      apache_ssl: 443,
      caddy: 80,
      caddy_ssl: 443
    },
    nginx: {
      rewrite: ''
    },
    url: '',
    root: '',
    mark: '',
    phpVersion: undefined
  })
  const errs = ref({
    name: false,
    root: false,
    cert: false,
    certkey: false,
    port_nginx: false,
    port_caddy: false,
    port_apache: false,
    port_nginx_ssl: false,
    port_apache_ssl: false,
    port_caddy_ssl: false
  })
  merge(item.value, props.edit)
  const rewrites: Ref<Array<string>> = ref([])
  const rewriteKey = ref('')
  const rewritePath = ref('')
  const appStore = AppStore()
  const brewStore = BrewStore()
  const hosts = computed(() => {
    return appStore.hosts
  })

  const php = computed(() => {
    return brewStore.module('php')
  })
  const phpVersions = computed(() => {
    const set: Set<number> = new Set()
    return (
      php?.value?.installed?.filter((p) => {
        if (p.version && p.num) {
          if (!set.has(p.num)) {
            set.add(p.num)
            return true
          }
          return false
        }
        return false
      }) ?? []
    )
  })

  watch(
    phpVersions,
    (v) => {
      if (props?.isEdit) {
        return
      }
      if (v && v[0] && !item.value.phpVersion) {
        item.value.phpVersion = v[0].num as any
      }
    },
    {
      immediate: true
    }
  )

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

  const onParkChange = () => {
    if (!park.value) {
      return Base._Confirm(I18nT('base.parkConfim'), undefined, {
        customClass: 'confirm-del',
        type: 'warning'
      })
    }
    return true
  }

  let monacoInstance: editor.IStandaloneCodeEditor | null

  const initEditor = () => {
    if (!monacoInstance) {
      if (!input?.value?.style) {
        return
      }
      const config = EditorConfigMake(item.value.nginx.rewrite, false, 'off')
      Object.assign(config, {
        minimap: {
          enabled: false
        },
        lineNumbers: 'off',
        padding: {
          top: 8,
          bottom: 8
        }
      })
      monacoInstance = EditorCreate(input.value, config)
    } else {
      monacoInstance.setValue(item.value.nginx.rewrite)
    }
  }

  const rewriteChange = (flag: any) => {
    if (!RewriteAll[flag]) {
      let file = join(rewritePath.value, `${flag}.conf`)
      readFileAsync(file).then((content) => {
        RewriteAll[flag] = content
        item.value.nginx.rewrite = content
        monacoInstance?.setValue(item.value.nginx.rewrite)
      })
    } else {
      item.value.nginx.rewrite = RewriteAll[flag]
      monacoInstance?.setValue(item.value.nginx.rewrite)
    }
  }

  const loadRewrite = () => {
    rewrites.value.splice(0)
    rewritePath.value = join(global.Server.Static, 'rewrite')
    if (Object.keys(RewriteAll).length === 0) {
      getAllFileAsync(rewritePath.value, false).then((files) => {
        files = files.sort()
        for (let file of files) {
          let k = file.replace('.conf', '')
          RewriteAll[k] = ''
          rewrites.value.push(k)
        }
      })
    } else {
      rewrites.value.push(...Object.keys(RewriteAll))
    }
  }

  const chooseRoot = (flag: 'root' | 'certkey' | 'cert', choosefile = false) => {
    const options: any = {}
    let opt = ['openDirectory', 'createDirectory', 'showHiddenFiles']
    if (choosefile) {
      opt.push('openFile')
    }
    options.properties = opt
    if (flag === 'root' && item?.value?.root) {
      options.defaultPath = item.value.root
    } else if (flag === 'cert' && item?.value?.ssl?.cert) {
      options.defaultPath = item.value.ssl.cert
    } else if (flag === 'certkey' && item?.value?.ssl?.key) {
      options.defaultPath = item.value.ssl.key
    }
    dialog.showOpenDialog(options).then(({ canceled, filePaths }: any) => {
      if (canceled || filePaths.length === 0) {
        return
      }
      const [path] = filePaths
      switch (flag) {
        case 'root':
          item.value.root = path
          break
        case 'cert':
          item.value.ssl.cert = path
          break
        case 'certkey':
          item.value.ssl.key = path
          break
      }
    })
  }

  const checkItem = () => {
    if (!Number.isInteger(item.value.port.nginx)) {
      errs.value['port_nginx'] = true
    }
    if (!Number.isInteger(item.value.port.apache)) {
      errs.value['port_apache'] = true
    }
    if (!Number.isInteger(item.value.port.caddy)) {
      errs.value['port_caddy'] = true
    }

    if (item.value.useSSL) {
      if (!Number.isInteger(item.value.port.nginx_ssl)) {
        errs.value['port_nginx_ssl'] = true
      }
      if (!Number.isInteger(item.value.port.apache_ssl)) {
        errs.value['port_apache_ssl'] = true
      }
      if (!Number.isInteger(item.value.port.caddy_ssl)) {
        errs.value['port_caddy_ssl'] = true
      }
    }

    errs.value['name'] = item.value.name.length === 0
    errs.value['root'] = item.value.root.length === 0
    if (item.value.useSSL && !item.value.autoSSL) {
      errs.value['cert'] = item.value.ssl.cert.length === 0
      errs.value['certkey'] = item.value.ssl.key.length === 0
    }
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
      const flag: 'edit' | 'add' = props.isEdit ? 'edit' : 'add'
      IPC.send('app-fork:host', 'doFixHostsRole').then((key: string) => {
        IPC.off(key)
        handleHost(item.value as any, flag, props.edit as AppHost, park.value).then(() => {
          running.value = false
          show.value = false
        })
      })
    }
    if (!item.value.phpVersion && !props.isEdit) {
      ElMessageBox.confirm(I18nT('host.noPhpWarning'), I18nT('host.warning'), {
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel'),
        type: 'warning'
      }).then(() => {
        saveFn()
      })
    } else {
      saveFn()
    }
  }

  loadRewrite()
  onMounted(() => {
    nextTick().then(() => {
      initEditor()
    })
  })
  onUnmounted(() => {
    monacoInstance && monacoInstance.dispose()
    monacoInstance = null
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
