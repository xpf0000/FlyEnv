<template>
  <el-drawer
    ref="host-edit-drawer"
    v-model="show"
    size="460px"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    class="host-edit-drawer"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-edit">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
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
            placeholder="name eg: www.xxx.com"
          />
          <textarea
            v-model.trim="item.alias"
            type="text"
            class="input-textarea"
            placeholder="alias eg: www.xxx.com"
          ></textarea>
          <input
            v-model.trim="item.mark"
            style="margin: 15px 0 10px"
            class="input"
            placeholder="mark"
          />
          <div class="path-choose mt-20 mb-20">
            <input
              type="text"
              :class="'input' + (errs['root'] ? ' error' : '')"
              placeholder="root path"
              readonly=""
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
              <el-popover placement="top" trigger="hover" :width="300">
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

        <div class="plant-title">Port</div>
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
            <div class="port-type">
              <span>Apache</span>
              <el-popover
                placement="top-start"
                :title="$t('base.attention')"
                :width="300"
                trigger="hover"
              >
                <template #reference>
                  <yb-icon
                    :svg="import('@/svg/question.svg?raw')"
                    width="12"
                    height="12"
                    style="margin-left: 5px"
                  ></yb-icon>
                </template>
                <p>{{ $t('base.apachePortTips1') }}</p>
                <p>{{ $t('base.apachePortTips2') }}</p>
              </el-popover>
            </div>
            <input
              v-model.number="item.port.apache"
              type="number"
              :class="'input' + (errs['port_apache'] ? ' error' : '')"
              placeholder="default: 8080"
            />
          </div>
        </div>

        <div class="plant-title">SSL</div>

        <div class="main">
          <div class="ssl-switch">
            <span>SSL</span>
            <el-switch v-model="item.useSSL"></el-switch>
          </div>

          <div v-if="item.useSSL" class="path-choose mt-20">
            <input
              type="text"
              :class="'input' + (errs['cert'] ? ' error' : '')"
              placeholder="cert"
              readonly=""
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

          <div v-if="item.useSSL" class="path-choose mt-20 mb-20">
            <input
              type="text"
              :class="'input' + (errs['certkey'] ? ' error' : '')"
              placeholder="cert key"
              readonly=""
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

          <div v-if="item.useSSL" class="ssl-switch mb-20 mt-20">
            <span>Port</span>
          </div>

          <div v-if="item.useSSL" class="port-set port-ssl mb-20">
            <div class="port-type"> Nginx </div>
            <input
              v-model.number="item.port.nginx_ssl"
              type="number"
              :class="'input' + (errs['port_nginx_ssl'] ? ' error' : '')"
              placeholder="default: 443"
            />
          </div>

          <div v-if="item.useSSL" class="port-set port-ssl mb-20">
            <div class="port-type"> Apache </div>
            <input
              v-model.number="item.port.apache_ssl"
              type="number"
              :class="'input' + (errs['port_apache_ssl'] ? ' error' : '')"
              placeholder="default: 8443"
            />
          </div>
        </div>

        <div class="plant-title">
          <span>Nginx Url Rewrite</span>
          <el-popover
            placement="top-start"
            :title="$t('base.attention')"
            :width="300"
            trigger="hover"
          >
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

        <div class="main">
          <el-select
            v-model="rewriteKey"
            filterable
            :placeholder="$t('base.commonTemplates')"
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
  import { AppStore } from '../../store/app'
  import { BrewStore } from '../../store/brew'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { ElMessageBox } from 'element-plus'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '../../fn'
  import { merge } from 'lodash'
  import { RewriteAll } from './store'

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
    ssl: {
      cert: '',
      key: ''
    },
    port: {
      nginx: 80,
      apache: 8080,
      nginx_ssl: 443,
      apache_ssl: 8443
    },
    nginx: {
      rewrite: ''
    },
    url: '',
    root: '',
    phpVersion: undefined
  })
  const errs = ref({
    name: false,
    root: false,
    cert: false,
    certkey: false,
    port_nginx: false,
    port_apache: false,
    port_nginx_ssl: false,
    port_apache_ssl: false
  })
  merge(item.value, props.edit)
  const rewrites: Ref<Array<string>> = ref([])
  const rewriteKey = ref('')
  const appStore = AppStore()
  const brewStore = BrewStore()
  const hosts = computed(() => {
    return appStore.hosts
  })
  const php = computed(() => {
    return brewStore.php
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
      return ElMessageBox.confirm(I18nT('base.parkConfim'), undefined, {
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel'),
        closeOnClickModal: false,
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
      monacoInstance = editor.create(input.value, {
        value: item.value.nginx.rewrite,
        language: 'ini',
        theme: 'vs-dark',
        scrollBeyondLastLine: false,
        overviewRulerBorder: false,
        automaticLayout: true,
        wordWrap: 'on',
        minimap: {
          enabled: false
        },
        lineNumbers: 'off',
        padding: {
          top: 8,
          bottom: 8
        }
      })
    } else {
      monacoInstance.setValue(item.value.nginx.rewrite)
    }
  }

  const rewriteChange = (flag: any) => {
    item.value.nginx.rewrite = RewriteAll[flag]
    monacoInstance?.setValue(item.value.nginx.rewrite)
  }

  const loadRewrite = () => {
    rewrites.value.splice(0)
    rewrites.value.push(...Object.keys(RewriteAll))
  }

  const chooseRoot = (flag: string) => {
    switch (flag) {
      case 'root':
        item.value.root = '/Users/XXX/Desktop/WWW/xxxx'
        break
      case 'cert':
        item.value.ssl.cert = '/Users/XXX/Desktop/WWW/xxxx.cert'
        break
      case 'certkey':
        item.value.ssl.key = '/Users/XXX/Desktop/WWW/xxxx.key'
        break
    }
  }

  const checkItem = () => {
    if (!Number.isInteger(item.value.port.nginx)) {
      errs.value['port_nginx'] = true
    }
    if (!Number.isInteger(item.value.port.apache)) {
      errs.value['port_apache'] = true
    }

    if (item.value.useSSL) {
      if (!Number.isInteger(item.value.port.nginx_ssl)) {
        errs.value['port_nginx_ssl'] = true
      }
      if (!Number.isInteger(item.value.port.apache_ssl)) {
        errs.value['port_apache_ssl'] = true
      }
    }

    errs.value['name'] = item.value.name.length === 0
    errs.value['root'] = item.value.root.length === 0
    if (item.value.useSSL) {
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
    running.value = true
    item.value.nginx.rewrite = monacoInstance?.getValue() ?? ''
    if (props.isEdit) {
      const find = appStore.hosts.findIndex((h) => h.id === props.edit.id)
      if (find >= 0) {
        appStore.hosts.splice(find, 1, JSON.parse(JSON.stringify(item.value)))
      }
    } else {
      appStore.hosts.unshift(JSON.parse(JSON.stringify(item.value)))
    }
    running.value = false
    show.value = false
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

<style lang="scss">
  .password-prompt {
    background: #32364a !important;
    border: 1px solid #32364a !important;
    color: #fff !important;
    .el-message-box__message,
    .el-message-box__close {
      color: rgba(255, 255, 255, 0.7) !important;
    }
  }
  .host-edit {
    width: 100%;
    height: 100%;
    background: #1d2033;
    display: flex;
    flex-direction: column;
    user-select: none;
    .nav {
      height: 76px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      background: #282b3d;
      .left {
        display: flex;
        align-items: center;
        padding: 6px 0;
      }
    }
    .main-wapper {
      flex: 1;
      width: 100%;
      overflow: auto;
      padding: 12px;
      color: rgba(255, 255, 255, 0.7);
      &::-webkit-scrollbar {
        width: 0;
        height: 0;
        display: none;
      }
      .input {
        background: transparent;
        border-top: none;
        border-left: none;
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.7);
        outline: none;
        height: 42px;
        color: #fff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        &::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        &:hover {
          border-bottom: 2px solid rgba(255, 255, 255, 0.7);
        }
        &:focus {
          border-bottom: 2px solid #01cc74;
        }
        &.error {
          border-bottom: 2px solid #cc5441;
        }
      }
      .input-textarea {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.7);
        outline: none;
        height: 120px;
        color: #fff;
        margin-top: 40px;
        border-radius: 8px;
        padding: 10px;
        resize: none;
        line-height: 1.6;
        &::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        &:hover {
          border: 2px solid rgba(255, 255, 255, 0.7);
        }
        &:focus {
          border: 2px solid #01cc74;
        }
        &.nginx-rewrite {
          height: 140px;
          margin-top: 20px;
          padding: 0;
          overflow: hidden;
        }
      }
      .el-select {
        &.error {
          .el-input__wrapper {
            box-shadow: 0 0 0 1px #cc5441 inset;
          }
        }
      }
      .main {
        background: #32364a;
        border-radius: 8px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        .path-choose {
          display: flex;
          align-items: flex-end;
          .input {
            flex: 1;
          }
          .icon-block {
            margin-left: 30px;
            display: flex;
            .choose {
              color: #01cc74;
            }
          }
        }
        .park {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 15px;

          .title {
            display: flex;
            align-items: center;
            margin-right: 20px;
          }
        }
        .ssl-switch {
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .port-set {
          display: flex;
          align-items: flex-end;
          .port-type {
            width: 70px;
            margin-right: 30px;
            flex-shrink: 0;
            display: flex;
            align-items: baseline;
          }
          .input {
            flex: 1;
            &::-webkit-outer-spin-button {
              -webkit-appearance: none !important;
              margin: 0;
            }
            &::-webkit-inner-spin-button {
              -webkit-appearance: none !important;
              margin: 0;
            }
          }
          &.port-ssl {
            .input {
              margin-right: 48px;
            }
          }
        }
      }
      .plant-title {
        padding: 22px 24px;
        font-size: 15px;
        font-weight: 600;
      }
    }
  }
</style>
