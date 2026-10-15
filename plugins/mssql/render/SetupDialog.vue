<template>
  <el-dialog
    v-model="show"
    :title="withEula ? MssqlT('eulaDialogTitle') : MssqlT('settings')"
    width="560px"
    :destroy-on-close="false"
    class="mssql-setup-dialog"
    @closed="onClosed"
  >
    <div class="flex flex-col gap-4">
      <template v-if="withEula">
        <el-alert type="warning" :closable="false" show-icon>
          <template #title>
            <span>{{ MssqlT('memoryNotice') }}</span>
          </template>
        </el-alert>
        <div class="flex items-center gap-2">
          <el-checkbox v-model="eulaAccepted" :label="MssqlT('eulaCheckboxLabel')" />
        </div>
        <el-button link type="primary" @click="openEula">{{ MssqlT('eulaLinkText') }}</el-button>
      </template>
      <el-alert
        v-if="isDeveloperEdition"
        type="error"
        :closable="false"
        show-icon
        :title="MssqlT('developerEditionNote')"
      />
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
      <el-button type="primary" :disabled="submitDisabled" @click="onSubmit">{{
        I18nT('base.confirm')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { shell } from '@/util/NodeFn'
  import { MessageError } from '@/util/Element'
  import { MssqlT } from './lang'
  import { MssqlManager, type MssqlVersionItem } from './store'
  import { isStrongSaPassword } from '../fork/Mssql/version'

  const props = defineProps<{
    /** Install mode also collects the EULA acceptance. */
    withEula: boolean
    /** Row being installed (install mode), used for edition hints. */
    item?: MssqlVersionItem
  }>()
  const emit = defineEmits<{ confirm: [] }>()

  const show = ref(false)
  const eulaAccepted = ref(false)
  const saPassword = ref('')
  const port = ref(1433)

  const isWindows = computed(() => window.Server.isWindows)
  const isDeveloperEdition = computed(() => {
    try {
      return JSON.parse(props.item?.note ?? '{}')?.edition === 'Developer'
    } catch {
      return false
    }
  })

  const submitDisabled = computed(() => {
    return props.withEula && !eulaAccepted.value
  })

  const open = async () => {
    await MssqlManager.init()
    eulaAccepted.value = MssqlManager.settings.eulaAccepted
    saPassword.value = MssqlManager.settings.saPassword
    port.value = MssqlManager.settings.port
    show.value = true
  }

  const openEula = () => {
    shell.openExternal('https://aka.ms/useterms').then().catch()
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
        port: port.value,
        eulaAccepted: props.withEula ? eulaAccepted.value : undefined
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
