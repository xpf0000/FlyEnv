<template>
  <el-dialog
    v-model="show"
    :title="MssqlT('settings')"
    width="560px"
    :destroy-on-close="false"
    class="mssql-setup-dialog"
    @closed="onClosed"
  >
    <div class="flex flex-col gap-4">
      <template v-if="!isWindows">
        <div class="flex flex-col gap-1">
          <span>{{ MssqlT('saPassword') }}</span>
          <el-input
            v-model="saPassword"
            type="password"
            show-password
            :placeholder="MssqlT('saPasswordPlaceholder')"
          />
          <span class="text-xs opacity-70">{{ MssqlT('saPasswordRule') }}</span>
          <span class="text-xs opacity-70">{{ MssqlT('initialPasswordNotice') }}</span>
        </div>
        <div class="flex flex-col gap-1">
          <span>{{ MssqlT('port') }}</span>
          <el-input-number v-model="port" :min="1" :max="65535" />
        </div>
      </template>
    </div>
    <template #footer>
      <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
      <el-button type="primary" @click="onSubmit">{{ I18nT('base.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { MessageError } from '@/util/Element'
  import { MssqlT } from './lang'
  import { MssqlManager } from './store'
  import { isStrongSaPassword } from '../fork/Mssql/version'

  const emit = defineEmits<{ confirm: [] }>()

  const show = ref(false)
  const saPassword = ref('')
  const port = ref(1433)

  const isWindows = computed(() => window.Server.isWindows)
  const open = async () => {
    await MssqlManager.init()
    saPassword.value = MssqlManager.settings.saPassword
    port.value = MssqlManager.settings.port
    show.value = true
  }

  const onClosed = () => {
    show.value = false
  }

  const onSubmit = async () => {
    if (!isWindows.value && saPassword.value && !isStrongSaPassword(saPassword.value)) {
      MessageError(MssqlT('saPasswordInvalid'))
      return
    }
    try {
      await MssqlManager.saveSettings({
        saPassword: saPassword.value,
        port: port.value
      })
    } catch (e: any) {
      MessageError(`${e?.message ?? e}`)
      return
    }
    show.value = false
    emit('confirm')
  }

  defineExpose({ open })
</script>
