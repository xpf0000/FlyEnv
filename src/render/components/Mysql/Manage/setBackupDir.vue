<template>
  <el-dialog
    v-model="show"
    :title="I18nT('mysql.backupSaveDirSet')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <div class="main-wapper">
        <el-input v-model="dir">
          <template #append>
            <el-button :icon="FolderOpened" @click.stop="chooseRoot()"></el-button>
          </template>
        </el-input>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { MySQLManage } from './manage'
  import { FolderOpened } from '@element-plus/icons-vue'
  import { dialog } from '@/util/NodeFn'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: ModuleInstalledItem
  }>()

  const dir = computed({
    get() {
      return MySQLManage.backupDir?.[props.item.bin] ?? ''
    },
    set(v) {
      MySQLManage.backupDir[props.item.bin] = v
    }
  })

  const chooseRoot = () => {
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        dir.value = path
      })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
