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
        <template v-if="showResetBtn && !management.readOnly(id)">
          <el-tooltip :content="I18nT('mysql.resetPasswordTips')">
            <el-button :loading="updating" :disabled="updating" type="warning" @click="doRest">{{
              I18nT('common.action.resetPassword')
            }}</el-button>
          </el-tooltip>
        </template>
        <template v-if="showUpdateBtn">
          <el-tooltip
            :content="
              I18nT('mysql.savePasswordTips', {
                app: 'MySQL'
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
  import { computed, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import { MysqlManagement as management } from '../manage'
  import { MysqlClusterManager as manager } from '../manager'
  import { uuid } from '@/util/Index'
  import { Refresh } from '@element-plus/icons-vue'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const props = withDefaults(
    defineProps<{
      id: string
      user: string
      host?: string
      showUpdateBtn: boolean
      showResetBtn: boolean
    }>(),
    { host: 'localhost' }
  )
  const password = ref(
    manager.preferences[props.id]?.passwords?.[`${props.user}@${props.host}`] ??
      (props.user === 'root' && props.host === 'localhost'
        ? (manager.credentials[props.id]?.password ?? '')
        : uuid(16))
  )
  const updating = computed(() => management.busy(props.id))
  const passwordChange = () => {
    password.value = uuid(16)
  }
  const doRest = async () => {
    if (await management.confirmPassword(props.id, props.user, props.host, password.value))
      show.value = false
  }
  const doSave = async () => {
    if (await management.savePassword(props.id, props.user, props.host, password.value))
      show.value = false
  }
  defineExpose({ show, onSubmit, onClosed })
</script>
