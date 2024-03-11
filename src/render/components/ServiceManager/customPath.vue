<template>
  <el-dialog
    v-model="show"
    :title="$t('base.customVersionDir')"
    width="600px"
    :destroy-on-close="true"
    custom-class="host-edit custom-path"
    @closed="closedFn"
  >
    <div class="main-wapper">
      <div class="plant-title">
        <span></span>
        <yb-icon
          :svg="import('@/svg/add.svg?raw')"
          class="add"
          width="18"
          height="18"
          @click="addDir(undefined)"
        />
      </div>
      <div class="main">
        <template v-for="(item, index) in dirs" :key="index">
          <div class="path-choose mb-20">
            <input type="text" class="input" placeholder="root path" readonly="" :value="item" />
            <div class="icon-block">
              <yb-icon
                :svg="import('@/svg/folder.svg?raw')"
                class="choose"
                width="18"
                height="18"
                @click="chooseDir(index)"
              />
              <yb-icon
                :svg="import('@/svg/delete.svg?raw')"
                class="choose"
                width="19"
                height="19"
                @click="delDir(index)"
              />
            </div>
          </div>
        </template>
      </div>
    </div>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { reactive, ref, watch, onBeforeUnmount, nextTick } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { AppSofts, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'

  const { dialog } = require('@electron/remote')
  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    flag: string
  }>()

  const appStore = AppStore()
  const brewStore = BrewStore()

  const flag: keyof typeof AppSofts = props.flag as any
  if (!appStore?.config?.setup?.[flag]) {
    appStore.config.setup[flag] = reactive({
      dirs: []
    })
  }

  const dirs = ref(appStore.config.setup[flag].dirs)

  const changed = ref(false)

  watch(
    dirs,
    (v: any) => {
      changed.value = true
      nextTick().then(() => {
        appStore.config.setup[flag].dirs = reactive(v)
        appStore.saveConfig()
        brewStore[flag].installedInited = false
      })
    },
    {
      deep: true
    }
  )

  const addDir = (index?: number) => {
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        if (index !== undefined) {
          dirs.value[index] = path
        } else {
          dirs.value.push(path)
        }
      })
  }
  const chooseDir = (index: number) => {
    addDir(index)
  }
  const delDir = (index: number) => {
    dirs.value.splice(index, 1)
  }

  onBeforeUnmount(() => {
    if (changed.value) {
      callback(true)
    }
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
