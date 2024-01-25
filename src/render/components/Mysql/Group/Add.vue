<template>
  <el-dialog
    v-model="show"
    :title="item?.dataDir ? $t('base.edit') : $t('base.add')"
    width="600px"
    :destroy-on-close="true"
    custom-class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <div class="main-wapper">
        <div class="main">
          <div class="path-choose mt-20 mb-20">
            <el-select
              v-model="form.path"
              class="w-p100"
              :class="{ error: errs?.path }"
              placeholder="Mysql Version"
            >
              <template v-for="(item, index) in mysqlVersion" :key="index">
                <el-option :label="`${item.version}-${item.bin}`" :value="item.path"></el-option>
              </template>
            </el-select>
          </div>
          <div class="path-choose mt-20 mb-20">
            <input
              v-model.trim="form.port"
              type="text"
              class="input"
              :class="{ error: errs?.port }"
              placeholder="Mysql Port"
            />
          </div>
          <div class="path-choose mt-20 mb-20">
            <input
              type="text"
              class="input"
              :class="{ error: errs?.dataDir }"
              placeholder="Mysql Data Dir"
              readonly=""
              :value="form.dataDir"
            />
            <div class="icon-block" @click="chooseRoot()">
              <yb-icon
                :svg="import('@/svg/folder.svg?raw')"
                class="choose"
                width="18"
                height="18"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button :disabled="running" @click="show = false">{{ $t('base.cancel') }}</el-button>
        <el-button :loading="running" :disabled="running" type="primary" @click="doSave">{{
          $t('base.confirm')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@shared/lang'
  import { uuid } from '@shared/utils'
  import { BrewStore } from '@/store/brew'
  import { MessageSuccess } from '@/util/Element'
  import type { MysqlGroupItem } from '@shared/app'
  import { MysqlStore } from '@/store/mysql'

  const { join } = require('path')
  const { dialog } = require('@electron/remote')
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: MysqlGroupItem
  }>()

  const mysqlStore = MysqlStore()
  const brewStore = BrewStore()
  const running = ref(false)
  const form = ref({
    id: uuid(8).toUpperCase(),
    path: '',
    port: undefined,
    dataDir: ''
  })

  Object.assign(form.value, props.item)
  form.value.path = props?.item?.version?.path ?? ''
  if (!form.value.dataDir) {
    form.value.dataDir = join(global.Server.MysqlDir, `group/mysql-group-${form.value.id}`)
  }

  const errs = ref({
    path: false,
    port: false,
    dataDir: false
  })

  const mysqlVersion = computed(() => {
    return brewStore?.['mysql']?.installed ?? []
  })

  watch(
    form,
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

  const checkItem = () => {
    errs.value.path = !form.value.path
    errs.value.port = !form.value.port
    errs.value.dataDir = !form.value.dataDir

    let k: keyof typeof errs.value
    for (k in errs.value) {
      if (errs.value[k]) {
        return false
      }
    }
    return true
  }

  const chooseRoot = () => {
    if (running?.value) {
      return
    }
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        form.value.dataDir = path
      })
  }

  const doSave = () => {
    if (!checkItem() || running?.value) {
      return
    }
    running.value = true
    const version: any = mysqlVersion.value.find((m) => m.path === form.value.path)!
    if (!props?.item?.id) {
      mysqlStore.all.push({
        id: form.value.id,
        version: JSON.parse(JSON.stringify(version)),
        port: form.value.port!,
        dataDir: form.value.dataDir
      })
    } else {
      const item = mysqlStore.all.find((f) => f.id === props.item.id)
      if (item) {
        const running = item.version.running
        mysqlStore.stop(item)
        item.version = JSON.parse(JSON.stringify(version))
        item.port = form.value.port!
        item.dataDir = form.value.dataDir
        mysqlStore.save().then()
        if (running) {
          mysqlStore.start(item).then()
        }
      }
    }

    mysqlStore.save()
    MessageSuccess(I18nT('base.success'))
    running.value = false
    show.value = false
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
<style lang="scss">
  .host-edit.new-project {
    width: 500px;
    height: auto;

    .el-dialog__body {
      padding: 5px 10px;
    }
  }
</style>
