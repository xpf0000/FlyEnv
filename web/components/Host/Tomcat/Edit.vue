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
          <input
            v-model.trim="item.mark"
            style="margin: 15px 0 10px"
            class="input"
            :placeholder="I18nT('host.placeholderRemarks')"
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
        </div>

        <div class="plant-title">{{ I18nT('host.hostPort') }}</div>
        <div class="main">
          <div class="port-set mb-20">
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
        <div class="main">
          <div class="ssl-switch">
            <span>SSL</span>
            <el-switch v-model="item.useSSL"></el-switch>
          </div>

          <div v-if="item.useSSL" class="ssl-switch" style="margin-top: 12px">
            <span>{{ I18nT('host.autoSSL') }}</span>
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
              <div class="port-type"> Tomcat </div>
              <input
                v-model.number="item.port.tomcat_ssl"
                type="number"
                :class="'input' + (errs['port_tomcat_ssl'] ? ' error' : '')"
                placeholder="default: 443"
              />
            </div>
          </template>
        </div>
        <div class="py-5"></div>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { AppStore } from '@web/store/app'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@web/fn'
  import { merge } from 'lodash'

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

  const chooseRoot = (flag: 'root' | 'certkey' | 'cert') => {
    switch (flag) {
      case 'root':
        item.value.root = '/Users/XXX/Desktop/WWW/xxxx'
        break
      case 'certkey':
        item.value.ssl.key = '/Users/XXX/Desktop/WWW/ssl.key'
        break
      case 'cert':
        item.value.ssl.cert = '/Users/XXX/Desktop/WWW/ssl.cert'
        break
    }
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

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
