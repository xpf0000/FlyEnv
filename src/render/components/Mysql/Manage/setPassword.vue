<template>
  <el-dialog
    v-model="show"
    :title="I18nT('mysql.rootPasswordChange', { user })"
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
        <template v-if="showResetBtn">
          <el-tooltip :content="I18nT('mysql.resetPasswordTips')">
            <el-button :loading="updating" :disabled="updating" type="warning" @click="doRest">{{
              I18nT('mysql.resetPassword')
            }}</el-button>
          </el-tooltip>
        </template>
        <template v-if="showUpdateBtn">
          <el-tooltip
            :content="
              I18nT('mysql.savePasswordTips', {
                app: item.typeFlag === 'mysql' ? 'MySQL' : 'MariaDB'
              })
            "
          >
            <el-button :loading="updating" :disabled="updating" type="primary" @click="doSave">{{
              I18nT('mysql.savePassword')
            }}</el-button>
          </el-tooltip>
        </template>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, reactive, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { MySQLManage } from './manage'
  import { uuid } from '@/util/Index'
  import { Refresh } from '@element-plus/icons-vue'
  import { ElMessageBox } from 'element-plus'
  import { BrewStore } from '@/store/brew'
  import { MessageSuccess } from '@/util/Element'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: ModuleInstalledItem
    user: string
    showUpdateBtn: boolean
    showResetBtn: boolean
  }>()

  const brewStore = BrewStore()

  const password = ref('root')
  if (props.user === 'root') {
    password.value = MySQLManage.userPassword?.[props.item.bin]?.[props.user] ?? 'root'
  } else {
    password.value = MySQLManage.userPassword?.[props.item.bin]?.[props.user] ?? uuid(16)
  }

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
        MySQLManage.passwordChange(props.item, props.user, password.value).catch()
      })
      .catch()
  }

  const doSave = () => {
    if (props.user === 'root') {
      const find = brewStore
        .module(props.item.typeFlag)
        .installed.find((v) => v.bin === props.item.bin && v.version === props.item.version)
      if (find) {
        find!.rootPassword = password.value
      }
    }
    if (!MySQLManage.userPassword?.[props.item.bin]) {
      MySQLManage.userPassword[props.item.bin] = reactive({})
    }
    MySQLManage.userPassword[props.item.bin][props.user] = password.value
    MySQLManage.save()
    MessageSuccess(I18nT('base.success'))
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
