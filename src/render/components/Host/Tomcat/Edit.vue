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
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">{{ isEdit ? I18nT('base.edit') : I18nT('base.add') }}</span>
        </div>
        <el-button :loading="running" :disabled="running" class="shrink0" @click="doSave">{{
          I18nT('base.save')
        }}</el-button>
      </div>

      <el-scrollbar class="flex-1">
        <div class="main-wapper p-3">
          <div class="main p-5">
            <input
              v-model.trim="item.name"
              type="text"
              :class="'input' + (errs['name'] ? ' error' : '')"
              :placeholder="I18nT('host.placeholderName')"
            />
            <input
              v-model.trim="item.mark"
              style="margin: 15px 0 10px"
              class="input"
              :placeholder="I18nT('host.placeholderComment')"
            />
            <div class="path-choose my-5">
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
          </div>

          <div class="plant-title">{{ I18nT('host.port') }}</div>
          <div class="main p-5">
            <div class="port-set mb-5">
              <div class="port-type"> Tomcat </div>
              <input
                v-model.number="item.port.tomcat"
                type="number"
                :class="'input' + (errs['port_tomcat'] ? ' error' : '')"
                placeholder="default: 80"
              />
            </div>
          </div>
          <div class="plant-title">{{ I18nT('host.hostSSL') }}</div>
          <div class="main p-5">
            <div class="ssl-switch">
              <span>SSL</span>
              <el-switch v-model="item.useSSL"></el-switch>
            </div>

            <div v-if="item.useSSL" class="ssl-switch" style="margin-top: 12px">
              <span>{{ I18nT('host.autoSSL') }}</span>
              <el-switch v-model="item.autoSSL"></el-switch>
            </div>

            <template v-if="item.useSSL && !item.autoSSL">
              <div class="path-choose mt-5">
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

              <div class="path-choose my-5">
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
              <div class="ssl-switch my-5">
                <span>Port</span>
              </div>
              <div class="port-set port-ssl mb-5">
                <div class="port-type"> Tomcat </div>
                <input
                  v-model.number="item.port.tomcat_ssl"
                  type="number"
                  :class="'input' + (errs['port_tomcat_ssl'] ? ' error' : '')"
                  placeholder="Default: 443"
                />
              </div>
            </template>
          </div>
          <div class="py-5"></div>
        </div>
      </el-scrollbar>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, onUnmounted, ref, watch } from 'vue'
  import { handleHost } from '@/util/Host'
  import { AppHost, AppStore } from '@/store/app'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { merge } from 'lodash-es'
  import { dialog } from '@/util/NodeFn'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    isEdit: boolean
    edit: any
  }>()
  const running = ref(false)
  const item = ref({
    id: new Date().getTime(),
    type: 'tomcat',
    name: '',
    alias: '',
    useSSL: false,
    autoSSL: false,
    ssl: {
      cert: '',
      key: ''
    },
    port: {
      tomcat: 80,
      tomcat_ssl: 443
    },
    url: '',
    root: '',
    mark: ''
  })
  const errs = ref({
    name: false,
    root: false,
    cert: false,
    certkey: false,
    port_tomcat: false,
    port_tomcat_ssl: false
  })
  merge(item.value, props.edit)
  const appStore = AppStore()
  const hosts = computed(() => {
    return appStore.hosts.filter((h) => h?.type === 'tomcat')
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
    for (const h of hosts.value) {
      if (h.name === name && h.id !== item.value.id) {
        errs.value['name'] = true
        break
      }
    }
  })

  const chooseRoot = (flag: 'root' | 'certkey' | 'cert', choosefile = false) => {
    const options: any = {}
    let opt = []
    if (choosefile) {
      opt = ['openFile', 'showHiddenFiles']
    } else {
      opt = ['openDirectory', 'createDirectory', 'showHiddenFiles']
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
    if (!Number.isInteger(item.value.port.tomcat)) {
      errs.value['port_tomcat'] = true
    }

    if (item.value.useSSL) {
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

    let u: URL | undefined
    try {
      u = new URL(item.value.name.includes('http') ? item.value.name : `https://${item.value.name}`)
    } catch {}
    if (!u) {
      errs.value['name'] = true
    } else {
      const name = u.hostname
      for (const h of hosts.value) {
        if (h.name === name && h.id !== item.value.id) {
          errs.value['name'] = true
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

      data.name = new URL(data.name.includes('http') ? data.name : `https://${data.name}`).hostname

      handleHost(data, flag, props.edit as AppHost, false).then(() => {
        running.value = false
        show.value = false
      })
    }
    saveFn()
  }

  appStore.floatBtnShow = false

  onUnmounted(() => {
    appStore.floatBtnShow = true
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
