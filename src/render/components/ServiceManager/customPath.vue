<template>
  <el-dialog
    v-model="show"
    :title="$t('base.customVersionDir')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit custom-path"
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
      <div class="main p-5">
        <template v-for="(item, _index) in dirs" :key="_index">
          <div class="path-choose mb-5">
            <input
              type="text"
              class="input"
              placeholder="Document Root Directory"
              readonly="true"
              :value="item"
            />
            <div class="icon-block">
              <yb-icon
                :svg="import('@/svg/folder.svg?raw')"
                class="choose"
                width="18"
                height="18"
                @click="chooseDir(_index)"
              />
              <yb-icon
                :svg="import('@/svg/delete.svg?raw')"
                class="choose"
                width="19"
                height="19"
                @click="delDir(_index)"
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
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import type { AllAppModule } from '@/core/type'
  import { dialog } from '@/util/NodeFn'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    flag: AllAppModule
  }>()

  const appStore = AppStore()
  const brewStore = BrewStore()

  const flag = props.flag
  const setupItem: any = appStore.config.setup
  if (!setupItem?.[flag]) {
    setupItem[flag] = reactive({
      dirs: []
    })
  }

  const dirs = ref(setupItem?.[flag]?.dirs ?? [])

  const changed = ref(false)

  watch(
    dirs,
    (v: any) => {
      changed.value = true
      nextTick().then(() => {
        if (!setupItem?.[flag]) {
          setupItem[flag] = reactive({
            dirs: []
          })
        }
        setupItem[flag].dirs = reactive(v)
        appStore.saveConfig()
        brewStore.module(flag).installedFetched = false
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
