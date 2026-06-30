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
          <span class="ml-3">{{ isEdit ? I18nT('common.action.edit') : I18nT('common.action.add') }}</span>
        </div>
        <el-button :loading="running" :disabled="running" class="shrink0" @click="doSave">{{
          I18nT('common.action.save')
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
              :placeholder="I18nT('common.label.comment')"
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
          <div class="main p-5">
            <div class="port-set">
              <el-select
                v-model="item.phpVersion"
                class="w-full"
                :placeholder="I18nT('base.selectPhpVersion')"
              >
                <el-option :value="undefined" :label="I18nT('host.staticSite')"></el-option>
                <template v-for="(v, _i) in phpVersions" :key="_i">
                  <el-option :value="v.num" :label="v.version">
                    <template #default>
                      <template v-if="v.run">
                        <span class="text-green-500">{{ v.version }}</span>
                      </template>
                      <template v-else>
                        <span>{{ v.version }}</span>
                      </template>
                    </template>
                  </el-option>
                </template>
              </el-select>
            </div>
          </div>

          <div class="plant-title flex items-center justify-between">
            <span>{{ I18nT('common.label.port') }}</span>
            <el-button link @click.stop="portAdvanced = !portAdvanced">
              {{ portAdvanced ? I18nT('host.portSimple') : I18nT('host.portAdvanced') }}
            </el-button>
          </div>
          <div class="main p-5">
            <template v-if="!portAdvanced">
              <div class="port-set mb-5">
                <div class="port-type"> {{ I18nT('common.label.port') }} </div>
                <input
                  v-model.number="primaryPort"
                  type="number"
                  :class="
                    'input' +
                    (errs['port_nginx'] ||
                    errs['port_caddy'] ||
                    errs['port_apache'] ||
                    errs['port_frankenphp']
                      ? ' error'
                      : '')
                  "
                  placeholder="Default: 80"
                />
              </div>
            </template>
            <template v-else>
              <div class="port-set mb-5">
                <div class="port-type"> Nginx </div>
                <input
                  v-model.number="item.port.nginx"
                  type="number"
                  :class="'input' + (errs['port_nginx'] ? ' error' : '')"
                  placeholder="Default: 80"
                  @input="onPortTouched('nginx')"
                />
              </div>

              <div class="port-set mb-5">
                <div class="port-type"> Caddy </div>
                <input
                  v-model.number="item.port.caddy"
                  type="number"
                  :class="'input' + (errs['port_caddy'] ? ' error' : '')"
                  placeholder="Default: 80"
                  @input="onPortTouched('caddy')"
                />
              </div>

              <div class="port-set mb-5">
                <div class="port-type"> Apache </div>
                <input
                  v-model.number="item.port.apache"
                  type="number"
                  :class="'input' + (errs['port_apache'] ? ' error' : '')"
                  placeholder="Default: 80"
                  @input="onPortTouched('apache')"
                />
              </div>

              <div class="port-set mb-5">
                <div class="port-type"> FrankenPHP </div>
                <input
                  v-model.number="item.port.frankenphp"
                  type="number"
                  :class="'input' + (errs['port_frankenphp'] ? ' error' : '')"
                  placeholder="Default: 80"
                  @input="onPortTouched('frankenphp')"
                />
              </div>
            </template>
          </div>
          <div class="plant-title">{{ I18nT('host.hostSSL') }}</div>
          <div class="main p-5">
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
              <template v-if="!portAdvanced">
                <div class="port-set port-ssl mb-5">
                  <div class="port-type"> Port </div>
                  <input
                    v-model.number="primaryPortSSL"
                    type="number"
                    :class="
                      'input' +
                      (errs['port_nginx_ssl'] ||
                      errs['port_caddy_ssl'] ||
                      errs['port_apache_ssl'] ||
                      errs['port_frankenphp_ssl']
                        ? ' error'
                        : '')
                    "
                    placeholder="Default: 443"
                  />
                </div>
              </template>
              <template v-else>
                <div class="port-set port-ssl mb-5">
                  <div class="port-type"> Nginx </div>
                  <input
                    v-model.number="item.port.nginx_ssl"
                    type="number"
                    :class="'input' + (errs['port_nginx_ssl'] ? ' error' : '')"
                    placeholder="Default: 443"
                    @input="onPortTouched('nginx_ssl')"
                  />
                </div>
                <div class="port-set port-ssl mb-5">
                  <div class="port-type"> Caddy </div>
                  <input
                    v-model.number="item.port.caddy_ssl"
                    type="number"
                    :class="'input' + (errs['port_caddy_ssl'] ? ' error' : '')"
                    placeholder="Default: 443"
                    @input="onPortTouched('caddy_ssl')"
                  />
                </div>
                <div class="port-set port-ssl mb-5">
                  <div class="port-type"> Apache </div>
                  <input
                    v-model.number="item.port.apache_ssl"
                    type="number"
                    :class="'input' + (errs['port_apache_ssl'] ? ' error' : '')"
                    placeholder="Default: 443"
                    @input="onPortTouched('apache_ssl')"
                  />
                </div>
                <div class="port-set port-ssl mb-5">
                  <div class="port-type"> FrankenPHP </div>
                  <input
                    v-model.number="item.port.frankenphp_ssl"
                    type="number"
                    :class="'input' + (errs['port_frankenphp_ssl'] ? ' error' : '')"
                    placeholder="Default: 443"
                    @input="onPortTouched('frankenphp_ssl')"
                  />
                </div>
              </template>
            </template>
          </div>

          <NginxRewrite v-model="item.nginx.rewrite" :item-name="itemName" />

          <div class="plant-title flex items-center justify-between">
            <span>{{ I18nT('host.reverseProxy') }}</span>
            <el-button link :icon="Plus" @click.stop="addReverseProxy"></el-button>
          </div>
          <div class="main p-5 flex flex-col gap-3">
            <template v-if="item.reverseProxy.length === 0">
              <div class="flex justify-center">{{ I18nT('common.value.none') }}</div>
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
      </el-scrollbar>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref, watch, onUnmounted, reactive } from 'vue'
  import { handleHost } from '@/util/Host'
  import { AppHost, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import Base from '@/core/Base'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { merge } from 'lodash-es'
  import { ElMessageBox } from 'element-plus'
  import { Plus, Delete } from '@element-plus/icons-vue'
  import SSLTips from './SSLTips/index.vue'
  import NginxRewrite from './Edit/nginxRewrite.vue'
  import { join } from '@/util/path-browserify'
  import { dialog, fs } from '@/util/NodeFn'
  import { uuid } from '@/util/Index'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    isEdit: boolean
    edit: any
  }>()
  const running = ref(false)
  const park = ref(false)
  type HostReverseProxyItem = {
    path: string
    url: string
  }
  type HostEditForm = AppHost & {
    reverseProxy: HostReverseProxyItem[]
    port: AppHost['port'] & {
      frankenphp: number
      frankenphp_ssl: number
    }
  }
  const item = ref<HostEditForm>({
    id: new Date().getTime(),
    type: 'php',
    name: `flyenv-test-${uuid(8)}.test`.toLowerCase(),
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
      frankenphp: 80,
      frankenphp_ssl: 443,
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
    port_frankenphp: false,
    port_nginx_ssl: false,
    port_apache_ssl: false,
    port_caddy_ssl: false,
    port_frankenphp_ssl: false,
    port_tomcat: false,
    port_tomcat_ssl: false
  })
  merge(item.value, props.edit)
  const appStore = AppStore()
  const brewStore = BrewStore()
  const hosts = computed(() => {
    return appStore.hosts.filter((h) => !h.type || h.type === 'php')
  })
  // #700: same domain is allowed as long as the listening port differs.
  // Two sites conflict only when they share a name AND any same-protocol
  // listening port (http: nginx/apache/caddy; https: their *_ssl).
  const samePort = (a: AppHost, b: AppHost) => {
    const httpDup =
      a.port.nginx === b.port.nginx ||
      a.port.apache === b.port.apache ||
      a.port.caddy === b.port.caddy ||
      (a.port.frankenphp ?? a.port.caddy) === (b.port.frankenphp ?? b.port.caddy)
    if (httpDup) {
      return true
    }
    if (a.useSSL && b.useSSL) {
      return (
        a.port.nginx_ssl === b.port.nginx_ssl ||
        a.port.apache_ssl === b.port.apache_ssl ||
        a.port.caddy_ssl === b.port.caddy_ssl ||
        (a.port.frankenphp_ssl ?? a.port.caddy_ssl) === (b.port.frankenphp_ssl ?? b.port.caddy_ssl)
      )
    }
    return false
  }

  // #700: most users run a single web server per site, so the three port
  // fields (nginx/caddy/apache) are collapsed into one "primary port" by
  // default. Editing it keeps the others in sync unless the user has
  // explicitly changed a port in the advanced section.
  const portAdvanced = ref(false)
  const portTouched = reactive({
    nginx: false,
    caddy: false,
    apache: false,
    frankenphp: false,
    nginx_ssl: false,
    caddy_ssl: false,
    apache_ssl: false,
    frankenphp_ssl: false
  })
  const onPortTouched = (key: keyof typeof portTouched) => {
    portTouched[key] = true
  }
  const primaryPort = computed<number>({
    get() {
      return item.value.port.nginx
    },
    set(v: number) {
      item.value.port.nginx = v
      if (!portTouched.caddy) {
        item.value.port.caddy = v
      }
      if (!portTouched.apache) {
        item.value.port.apache = v
      }
      if (!portTouched.frankenphp) {
        item.value.port.frankenphp = v
      }
    }
  })
  const primaryPortSSL = computed<number>({
    get() {
      return item.value.port.nginx_ssl
    },
    set(v: number) {
      item.value.port.nginx_ssl = v
      if (!portTouched.caddy_ssl) {
        item.value.port.caddy_ssl = v
      }
      if (!portTouched.apache_ssl) {
        item.value.port.apache_ssl = v
      }
      if (!portTouched.frankenphp_ssl) {
        item.value.port.frankenphp_ssl = v
      }
    }
  })
  // When editing a site whose servers use different ports, the simple single
  // port field can't represent them — open the advanced view and mark the
  // diverging ports as touched so the follow-linking won't clobber them.
  if (props?.isEdit) {
    const p = item.value.port
    const httpDiff = !(
      p.nginx === p.caddy &&
      p.caddy === p.apache &&
      p.apache === (p.frankenphp ?? p.caddy)
    )
    const sslDiff = !(
      p.nginx_ssl === p.caddy_ssl &&
      p.caddy_ssl === p.apache_ssl &&
      p.apache_ssl === (p.frankenphp_ssl ?? p.caddy_ssl)
    )
    if (httpDiff || sslDiff) {
      portAdvanced.value = true
      portTouched.caddy = true
      portTouched.apache = true
      portTouched.frankenphp = true
      portTouched.caddy_ssl = true
      portTouched.apache_ssl = true
      portTouched.frankenphp_ssl = true
    }
  }
  const php = computed(() => {
    return brewStore.module('php')
  })

  const phpRunVersions = computed(() => {
    const versions: Record<string, boolean> = {}
    php?.value?.installed?.forEach((p) => {
      if (p.version && typeof p.version === 'string') {
        const k = p.version.split('.').slice(0, 2).join('.')
        if (!versions?.[k]) {
          versions[k] = p.run
        }
      }
    })
    return versions
  })

  const phpVersions = computed(() => {
    const set: Set<number> = new Set()
    const arr =
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
    return arr.map((p) => {
      const version = p.version.split('.').slice(0, 2).join('.')
      return {
        ...p,
        version,
        run: phpRunVersions.value?.[version] ?? false
      }
    })
  })

  const nginxRewriteTemplateDir = join(window.Server.BaseDir!, 'NginxRewriteTemplate')
  fs.mkdirp(nginxRewriteTemplateDir).then().catch()

  watch(
    phpVersions,
    (v) => {
      if (props?.isEdit) {
        return
      }
      if (v && v?.[0] && v?.[0]?.num && !item.value.phpVersion) {
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

  // #700: when the user types a domain containing a port (e.g.
  // `localhost:8080`), apply that port to the http listening port field(s) so
  // it doesn't get silently dropped on save (`data.name` becomes the hostname).
  const applyPortFromName = (name: string) => {
    let u: URL | undefined
    try {
      u = new URL(name.includes('http') ? name : `https://${name}`)
    } catch {}
    if (!u || !u.port) {
      return
    }
    const port = Number(u.port)
    if (!Number.isInteger(port)) {
      return
    }
    primaryPort.value = port
  }

  watch(itemName, (name) => {
    applyPortFromName(name)
    for (const h of hosts.value) {
      if (h.name === name && h.id !== item.value.id && samePort(h, item.value)) {
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
    if (!Number.isInteger(item.value.port.nginx)) {
      errs.value['port_nginx'] = true
    }
    if (!Number.isInteger(item.value.port.apache)) {
      errs.value['port_apache'] = true
    }
    if (!Number.isInteger(item.value.port.caddy)) {
      errs.value['port_caddy'] = true
    }
    if (!Number.isInteger(item.value.port.frankenphp)) {
      errs.value['port_frankenphp'] = true
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
      if (!Number.isInteger(item.value.port.frankenphp_ssl)) {
        errs.value['port_frankenphp_ssl'] = true
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
    let u: URL | undefined
    try {
      u = new URL(item.value.name.includes('http') ? item.value.name : `https://${item.value.name}`)
    } catch {}
    if (!u) {
      errs.value['name'] = true
    } else {
      const name = u.hostname
      for (const h of hosts.value) {
        if (h.name === name && h.id !== item.value.id && samePort(h, item.value)) {
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
      handleHost(data, flag, props.edit as AppHost, park.value).then(() => {
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
