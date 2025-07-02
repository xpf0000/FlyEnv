<template>
  <el-dialog
    v-model="show"
    :title="I18nT('mysql.rootPasswordChange')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <div class="main-wapper">
        <el-input v-model="password">
          <template #append>
            <el-button :icon="Refresh" @click.stop="passwordChange()"></el-button>
          </template>
        </el-input>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
        <el-tooltip :content="I18nT('mysql.resetPasswordTips')">
          <el-button :loading="updating" :disabled="updating" type="warning" @click="doRest">{{
            I18nT('mysql.resetPassword')
          }}</el-button>
        </el-tooltip>
        <el-tooltip :content="I18nT('mysql.savePasswordTips')">
          <el-button :loading="updating" :disabled="updating" type="primary" @click="doSave">{{
            I18nT('mysql.savePassword')
          }}</el-button>
        </el-tooltip>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { MySQLManage } from './manage'
  import { uuid } from '@/util/Index'
  import { Refresh } from '@element-plus/icons-vue'
  import { ElMessageBox } from 'element-plus'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: ModuleInstalledItem
  }>()

  const password = ref(MySQLManage.rootPassword?.[props.item.bin] ?? 'root')

  const updating = computed({
    get() {
      return MySQLManage.updating?.[props.item.bin] ?? false
    },
    set(v) {
      MySQLManage.updating[props.item.bin] = v
    }
  })

  const passwordChange = () => {
    password.value = uuid(16)
  }

  const doRest = () => {
    ElMessageBox.confirm(I18nT('mysql.resetPasswordConfirm'), I18nT('host.warning'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => {
        MySQLManage.rootPasswordChange(props.item, password.value).catch()
      })
      .catch()
  }

  const doSave = () => {
    MySQLManage.rootPassword[props.item.bin] = password.value
    MySQLManage.save()
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
