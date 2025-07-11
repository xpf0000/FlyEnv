<template>
  <el-dialog
    v-model="show"
    :title="index >= 0 ? I18nT('base.edit') : I18nT('base.add')"
    size="600px"
    :destroy-on-close="true"
    @closed="closedFn"
  >
    <template #default>
      <el-input v-model="path">
        <template #append>
          <el-button :icon="FolderOpened" @click.stop="choose()"></el-button>
        </template>
      </el-input>
    </template>
    <template #footer>
      <div class="flex justify-end">
        <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" @click="doSubmit">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { FolderOpened } from '@element-plus/icons-vue'
  import { MessageError } from '@/util/Element'
  import { isAbsolute } from '@/util/path-browserify'
  import { fs, exec } from '@/util/NodeFn'
  import { chooseFolder } from '@/util/File'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    item: string
    index: number
  }>()

  const path = ref(props.item)
  const loading = ref(false)

  const choose = () => {
    chooseFolder().then((p: string) => {
      path.value = p
    })
  }

  const doSubmit = async () => {
    if (loading.value) {
      return
    }
    loading.value = true
    if (isAbsolute(path.value) && (await fs.existsSync(path.value))) {
      callback({
        path: path.value,
        raw: path.value,
        index: props.index
      })
      show.value = false
      return
    }
    exec
      .exec(`echo ${path.value}`)
      .then(async (res: string) => {
        const p = res?.trim() ?? ''
        if (isAbsolute(p) && (await fs.existsSync(p))) {
          const real = await fs.realpath(p)
          callback({
            path: path.value,
            raw: real,
            index: props.index
          })
          show.value = false
          return
        } else {
          MessageError(I18nT('tools.invalidPath'))
          loading.value = false
        }
      })
      .catch(() => {
        MessageError(I18nT('tools.invalidPath'))
        loading.value = false
      })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
