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
          <span class="ml-3">{{
            isEdit ? I18nT('common.action.edit') : I18nT('common.action.add')
          }}</span>
        </div>
        <el-button
          :loading="tomcatSiteController.saving"
          :disabled="tomcatSiteController.saving"
          class="shrink0"
          @click="doSave"
        >
          {{ I18nT('common.action.save') }}
        </el-button>
      </div>

      <el-scrollbar class="flex-1">
        <div class="main-wapper p-3">
          <div class="main p-5">
            <input
              v-model.trim="item.name"
              type="text"
              :class="'input' + (errs.name ? ' error' : '')"
              :placeholder="I18nT('host.placeholderName')"
            />
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
                :class="'input' + (errs.root ? ' error' : '')"
                :placeholder="I18nT('host.tomcatAppBase')"
              />
              <div class="icon-block" @click="choosePath('root')">
                <yb-icon
                  :svg="import('@/svg/folder.svg?raw')"
                  class="choose"
                  width="18"
                  height="18"
                />
              </div>
            </div>
          </div>

          <div class="plant-title flex items-center justify-between">
            <span>{{ I18nT('host.tomcatContexts') }}</span>
            <el-button link :icon="Plus" @click.stop="addContext" />
          </div>
          <div class="main p-5 flex flex-col gap-3">
            <template v-if="tomcat.contexts.length === 0">
              <div class="flex justify-center">{{ I18nT('common.value.none') }}</div>
            </template>
            <template v-else>
              <div
                v-for="(context, index) in tomcat.contexts"
                :key="context.id"
                class="context-mapping-row flex items-center gap-2"
              >
                <el-button link :icon="Delete" @click.stop="removeContext(index)" />
                <input
                  v-model="context.path"
                  type="text"
                  :class="'input context-path' + (contextErrors[index]?.path ? ' error' : '')"
                  :placeholder="I18nT('host.tomcatContextPath')"
                />
                <div class="path-choose context-doc-base">
                  <input
                    v-model="context.docBase"
                    type="text"
                    :class="'input' + (contextErrors[index]?.docBase ? ' error' : '')"
                    :placeholder="I18nT('host.tomcatDocBase')"
                  />
                  <div class="icon-block" @click="chooseDocBase(context)">
                    <yb-icon
                      :svg="import('@/svg/folder.svg?raw')"
                      class="choose"
                      width="18"
                      height="18"
                    />
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div class="plant-title">{{ I18nT('host.tomcatRewrite') }}</div>
          <div class="main p-5">
            <div class="ssl-switch"
              ><span>{{ I18nT('host.tomcatRewrite') }}</span
              ><el-switch v-model="tomcat.rewrite.enabled"
            /></div>
            <RewriteEditor
              v-if="tomcat.rewrite.enabled"
              v-model="tomcat.rewrite.content"
              class="mt-4"
            />
          </div>

          <div class="plant-title">{{ I18nT('common.label.port') }}</div>
          <div class="main p-5">
            <div class="port-set mb-5"
              ><div class="port-type">Tomcat</div
              ><input
                v-model.number="item.port.tomcat"
                type="number"
                :class="'input' + (errs.portTomcat ? ' error' : '')"
                placeholder="default: 80"
            /></div>
          </div>

          <div class="plant-title">{{ I18nT('host.hostSSL') }}</div>
          <div class="main p-5">
            <div class="ssl-switch"><span>SSL</span><el-switch v-model="item.useSSL" /></div>
            <div v-if="item.useSSL" class="ssl-switch mt-3"
              ><span>{{ I18nT('host.autoSSL') }}</span
              ><el-switch v-model="item.autoSSL"
            /></div>
            <template v-if="item.useSSL && !item.autoSSL">
              <div class="path-choose mt-5"
                ><input
                  v-model.trim="item.ssl.cert"
                  type="text"
                  :class="'input' + (errs.cert ? ' error' : '')"
                  placeholder="cert" /><div class="icon-block" @click="choosePath('cert')"
                  ><yb-icon
                    :svg="import('@/svg/folder.svg?raw')"
                    class="choose"
                    width="18"
                    height="18" /></div
              ></div>
              <div class="path-choose my-5"
                ><input
                  v-model.trim="item.ssl.key"
                  type="text"
                  :class="'input' + (errs.key ? ' error' : '')"
                  placeholder="cert key" /><div class="icon-block" @click="choosePath('key')"
                  ><yb-icon
                    :svg="import('@/svg/folder.svg?raw')"
                    class="choose"
                    width="18"
                    height="18" /></div
              ></div>
            </template>
            <div v-if="item.useSSL" class="port-set port-ssl mb-5"
              ><div class="port-type">Tomcat SSL</div
              ><input
                v-model.number="item.port.tomcat_ssl"
                type="number"
                :class="'input' + (errs.portTomcatSSL ? ' error' : '')"
                placeholder="default: 443"
            /></div>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, onUnmounted, ref, watch } from 'vue'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { Plus, Delete } from '@element-plus/icons-vue'
  import { dialog, fs } from '@/util/NodeFn'
  import { uuid } from '@/util/Index'
  import RewriteEditor from './RewriteEditor.vue'
  import tomcatSiteController from './TomcatSiteController'
  import {
    appBaseContextCandidates,
    cloneTomcatSiteHost,
    createTomcatSiteConfig,
    mergeAppBaseContextCandidates,
    rendererContextPathError,
    rendererTomcatNameError,
    type AppBaseEntry,
    type TomcatContextForm
  } from './site'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const props = defineProps<{ isEdit: boolean; edit: any }>()
  const appStore = AppStore()
  const item = ref(cloneTomcatSiteHost(props.edit ?? { tomcat: createTomcatSiteConfig() }))
  const errs = ref({
    name: false,
    root: false,
    cert: false,
    key: false,
    portTomcat: false,
    portTomcatSSL: false
  })
  const contextErrors = ref<Array<{ path: boolean; docBase: boolean }>>([])
  const tomcat = computed(() => item.value.tomcat)
  const hosts = computed(() => appStore.hosts.filter((host) => host.type === 'tomcat'))

  watch(
    item,
    () => {
      errs.value = {
        name: false,
        root: false,
        cert: false,
        key: false,
        portTomcat: false,
        portTomcatSSL: false
      }
      contextErrors.value = []
    },
    { deep: true }
  )

  const scanAppBaseContexts = async (appBase: string) => {
    try {
      const [directories, files] = await Promise.all([
        fs.subdir(appBase),
        fs.readdir(appBase, false)
      ])
      const entries: AppBaseEntry[] = [
        ...directories.map((name) => ({ name, kind: 'directory' as const })),
        ...files
          .filter((name) => !name.includes('/') && !name.includes('\\') && /\.war$/i.test(name))
          .map((name) => ({ name, kind: 'war' as const }))
      ]
      tomcat.value.contexts = mergeAppBaseContextCandidates(
        tomcat.value.contexts,
        appBaseContextCandidates(appBase, entries),
        () => uuid(12)
      )
    } catch {
      // AppBase discovery is optional; the selected root and current form state remain usable.
    }
  }

  const choosePath = async (field: 'root' | 'cert' | 'key') => {
    const file = field !== 'root'
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: file
        ? ['openFile', 'showHiddenFiles']
        : ['openDirectory', 'createDirectory', 'showHiddenFiles']
    })
    if (canceled || filePaths.length === 0) return
    const [path] = filePaths
    if (field === 'root') {
      item.value.root = path
      await scanAppBaseContexts(path)
    } else {
      item.value.ssl[field] = path
    }
  }

  const chooseDocBase = (context: TomcatContextForm) => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'openDirectory', 'showHiddenFiles'],
        defaultPath: context.docBase || item.value.root
      })
      .then(({ canceled, filePaths }: any) => {
        if (!canceled && filePaths.length > 0) context.docBase = filePaths[0]
      })
  }

  const addContext = () => tomcat.value.contexts.push({ id: uuid(12), path: '/', docBase: '' })
  const removeContext = (index: number) => tomcat.value.contexts.splice(index, 1)

  const checkItem = () => {
    const current = item.value
    errs.value.root = !current.root
    errs.value.portTomcat = !Number.isInteger(current.port.tomcat)
    errs.value.portTomcatSSL = current.useSSL && !Number.isInteger(current.port.tomcat_ssl)
    errs.value.cert = current.useSSL && !current.autoSSL && !current.ssl.cert
    errs.value.key = current.useSSL && !current.autoSSL && !current.ssl.key
    try {
      current.name = new URL(
        current.name.includes('http') ? current.name : `https://${current.name}`
      ).hostname
    } catch {
      errs.value.name = true
    }
    errs.value.name =
      !current.name ||
      rendererTomcatNameError(current.name) ||
      hosts.value.some(
        (host) =>
          host.id !== current.id && host.name.trim().toLowerCase() === current.name.toLowerCase()
      )
    const seen = new Set<string>()
    contextErrors.value = current.tomcat.contexts.map((context) => {
      const invalidPath = !!rendererContextPathError(context.path) || seen.has(context.path)
      seen.add(context.path)
      return { path: invalidPath, docBase: !context.docBase }
    })
    return (
      !Object.values(errs.value).some(Boolean) &&
      !contextErrors.value.some((error) => error.path || error.docBase)
    )
  }

  const doSave = async () => {
    if (!checkItem()) return
    const result = await tomcatSiteController.save(
      item.value as any,
      props.isEdit ? 'edit' : 'add',
      props.edit
    )
    if (result) show.value = false
  }

  appStore.floatBtnShow = false
  onUnmounted(() => {
    appStore.floatBtnShow = true
  })
  defineExpose({ show, onSubmit, onClosed })
</script>

<style lang="scss" scoped>
  .context-mapping-row {
    min-width: 0;

    .context-path {
      flex: 0 1 112px;
      min-width: 80px;
    }

    .context-doc-base {
      flex: 1 1 0;
      min-width: 0;

      .icon-block {
        margin-left: 12px;
      }
    }
  }
</style>
