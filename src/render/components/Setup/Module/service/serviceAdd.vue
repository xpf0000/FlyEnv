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
            :placeholder="I18nT('host.placeholderComment')"
          />
          <div class="path-choose mt-20 mb-20">
            <input
              v-model.trim="item.root"
              type="text"
              :class="'input' + (errs['root'] ? ' error' : '')"
              :placeholder="I18nT('host.placeholderRootPath')"
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
              <span>{{ I18nT('base.parkTitle') }}</span>
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
                    {{ I18nT('base.parkTips') }}
                  </p>
                </template>
              </el-popover>
            </div>
            <el-switch v-model="park" :before-change="onParkChange"></el-switch>
          </div>
        </div>

        <div class="plant-title">{{ I18nT('base.phpVersion') }}</div>
        <div class="main">
          <div class="port-set">
            <el-select
              v-model="item.phpVersion"
              class="w-p100"
              :placeholder="I18nT('base.selectPhpVersion')"
            >
              <el-option :value="undefined" :label="I18nT('host.staticSite')"></el-option>
              <template v-for="(v, _i) in phpVersions" :key="_i">
                <el-option :value="v.num" :label="v.num"></el-option>
              </template>
            </el-select>
          </div>
        </div>

        <div class="plant-title">{{ I18nT('host.port') }}</div>
        <div class="main">
          <div class="port-set mb-20">
            <div class="port-type"> Nginx </div>
            <input
              v-model.number="item.port.nginx"
              type="number"
              :class="'input' + (errs['port_nginx'] ? ' error' : '')"
              placeholder="Default: 80"
            />
          </div>

          <div class="port-set mb-20">
            <div class="port-type"> Caddy </div>
            <input
              v-model.number="item.port.caddy"
              type="number"
              :class="'input' + (errs['port_caddy'] ? ' error' : '')"
              placeholder="Default: 80"
            />
          </div>

          <div class="port-set mb-20">
            <div class="port-type"> Apache </div>
            <input
              v-model.number="item.port.apache"
              type="number"
              :class="'input' + (errs['port_apache'] ? ' error' : '')"
              placeholder="Default: 80"
            />
          </div>
        </div>
        <div class="plant-title">{{ I18nT('host.hostSSL') }}</div>
        <div class="main">
          <div class="ssl-switch">
            <span>SSL</span>
            <el-switch v-model="item.useSSL"></el-switch>
          </div>

          <div v-if="item.useSSL" class="ssl-switch" style="margin-top: 12px">
            <div class="inline-flex items-center gap-1">
              <span>{{ I18nT('host.autoSSL') }}</span>
              <SSLTips />
            </div>
            <el-switch v-model="item.autoSSL"></el-switch>
          </div>

          <template v-if="item.useSSL && !item.autoSSL">
            <div class="path-choose mt-20">
              <input
                v-model.trim="item.ssl.cert"
                type="text"
                :class="'input' + (errs['cert'] ? ' error' : '')"
                placeholder="cert"
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
                v-model.trim="item.ssl.key"
                type="text"
                :class="'input' + (errs['certkey'] ? ' error' : '')"
                placeholder="cert key"
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
                placeholder="Default: 443"
              />
            </div>
            <div class="port-set port-ssl mb-20">
              <div class="port-type"> Caddy </div>
              <input
                v-model.number="item.port.caddy_ssl"
                type="number"
                :class="'input' + (errs['port_caddy_ssl'] ? ' error' : '')"
                placeholder="Default: 443"
              />
            </div>
            <div class="port-set port-ssl mb-20">
              <div class="port-type"> Apache </div>
              <input
                v-model.number="item.port.apache_ssl"
                type="number"
                :class="'input' + (errs['port_apache_ssl'] ? ' error' : '')"
                placeholder="Default: 443"
              />
            </div>
          </template>
        </div>

        <NginxRewrite v-model="item.nginx.rewrite" :item-name="itemName" />

        <div class="plant-title flex items-center justify-between">
          <span>{{ I18nT('host.reverseProxy') }}</span>
          <el-button link :icon="Plus" @click.stop="addReverseProxy"></el-button>
        </div>
        <div class="main flex flex-col gap-3">
          <template v-if="item.reverseProxy.length === 0">
            <div class="flex justify-center">{{ I18nT('base.none') }}</div>
          </template>
          <template v-else>
            <template v-for="(proxy, index) in item.reverseProxy" :key="index">
              <div class="flex items-center justify-between gap-2">
                <el-button link :icon="Delete" @click.stop="delReverseProxy(index)"></el-button>
                <el-input v-model="proxy.path" class="w-28 ml-2"></el-input>
                <el-input v-model="proxy.url"></el-input>
              </div>
            </template>
          </template>
        </div>
        <div class="py-5"></div>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref, watch, onMounted, onUnmounted, reactive } from 'vue'
  import { handleHost } from '@/util/Host'
  import { AppHost, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import Base from '@/core/Base'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { merge } from 'lodash'
  import { ElMessageBox } from 'element-plus'
  import { Plus, Delete } from '@element-plus/icons-vue'
  import SSLTips from './SSLTips/index.vue'
  import NginxRewrite from './Edit/nginxRewrite.vue'

  const { dialog } = require('@electron/remote')
  const { join } = require('path')
  const { mkdirp } = require('fs-extra')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    isEdit: boolean
    edit: any
  }>()
  const running = ref(false)
  const park = ref(false)
  const item = ref({
    id: new Date().getTime(),
    type: 'php',
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
      caddy_ssl: 443,
      tomcat: 80,
      tomcat_ssl: 443
    },
    nginx: {
      rewrite: ''
    },
    url: '',
    root: '',
    mark: '',
    phpVersion: undefined,
    reverseProxy: []
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
    port_caddy_ssl: false,
    port_tomcat: false,
    port_tomcat_ssl: false
  })
  merge(item.value, props.edit)
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

  const nginxRewriteTemplateDir = join(global.Server.BaseDir!, 'NginxRewriteTemplate')
  mkdirp(nginxRewriteTemplateDir).then().catch()

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

  const addReverseProxy = () => {
    const d = reactive({
      path: '/',
      url: 'http://127.0.0.1:3000'
    })
    const arr: any[] = item.value.reverseProxy as any
    arr.unshift(d)
  }

  const delReverseProxy = (index: number) => {
    const arr: any[] = item.value.reverseProxy as any
    arr.splice(index, 1)
  }

  const onParkChange = () => {
    if (!park.value) {
      return Base._Confirm(I18nT('base.parkConfirm'), undefined, {
        customClass: 'confirm-del',
        type: 'warning'
      })
    }
    return true
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
    if (!Number.isInteger(item.value.port.tomcat)) {
      errs.value['port_tomcat'] = true
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
      if (!Number.isInteger(item.value.port.tomcat_ssl)) {
        errs.value['port_tomcat_ssl'] = true
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
      let flag: 'edit' | 'add' = props.isEdit ? 'edit' : 'add'
      handleHost(item.value, flag, props.edit as AppHost, park.value).then(() => {
        running.value = false
        show.value = false
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

  onMounted(() => {})
  onUnmounted(() => {})

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
