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
        <el-input
          v-model="dir"
          :disabled="management.busy(id) || management.directoryBusy(id)"
          @change="management.saveBackupDirectory(id, dir)"
        >
          <template #append>
            <el-button
              :icon="FolderOpened"
              :loading="management.directoryBusy(id)"
              :disabled="management.busy(id)"
              @click.stop="chooseRoot()"
            ></el-button>
          </template>
        </el-input>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { ref, watch } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import { MysqlManagement as management } from '../manage'
  import { MysqlClusterManager as manager } from '../manager'
  import { FolderOpened } from '@element-plus/icons-vue'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const props = defineProps<{ id: string }>()
  const dir = ref(manager.preferences[props.id]?.backupDir ?? '')
  watch(
    () => manager.preferences[props.id]?.backupDir,
    (value) => {
      dir.value = value ?? ''
    }
  )
  const chooseRoot = () => management.chooseBackupDirectory(props.id)
  defineExpose({ show, onSubmit, onClosed })
</script>
