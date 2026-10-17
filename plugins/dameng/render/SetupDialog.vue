<template>
  <el-dialog
    v-model="show"
    :title="DamengT(resuming ? 'resumeInitialization' : target ? 'initialize' : 'settings')"
    width="600px"
    class="dameng-setup-dialog"
    @closed="closed"
  >
    <el-scrollbar height="100%">
      <div class="flex flex-col gap-4 pr-3">
        <el-alert
          :closable="false"
          type="info"
          :title="
            DamengT(
              resuming
                ? 'resumeInitializationNotice'
                : target
                  ? 'initializeNotice'
                  : 'sessionNotice'
            )
          "
        />
        <el-form v-if="!resuming" label-position="top">
          <el-form-item :label="DamengT(target ? 'initialSysdbaPassword' : 'sysdbaPassword')">
            <el-input
              v-model="credentials.sysdbaPassword"
              type="password"
              show-password
              autocomplete="off"
            >
              <template v-if="target" #append>
                <el-button @click="generate('sysdbaPassword')">{{
                  DamengT('generatePassword')
                }}</el-button>
              </template>
            </el-input>
            <p class="mt-2 text-xs opacity-70">{{
              DamengT(target ? 'initialSysdbaHelp' : 'currentSysdbaHelp')
            }}</p>
          </el-form-item>
          <el-form-item v-if="target" :label="DamengT('auditorPassword')">
            <el-input
              v-model="credentials.auditorPassword"
              type="password"
              show-password
              autocomplete="off"
            >
              <template #append>
                <el-button @click="generate('auditorPassword')">{{
                  DamengT('generatePassword')
                }}</el-button>
              </template>
            </el-input>
            <p class="mt-2 text-xs opacity-70">{{ DamengT('auditorHelp') }}</p>
          </el-form-item>
          <p v-if="target" class="mb-4 text-xs opacity-70">{{ DamengT('passwordRule') }}</p>
          <el-divider content-position="left">{{ DamengT('immutable') }}</el-divider>
          <div class="grid grid-cols-2 gap-x-6">
            <el-form-item :label="DamengT('pageSize')">
              <el-select v-model="settings.pageSize"
                ><el-option
                  v-for="value in DAMENG_LIMITS.pageSizes"
                  :key="value"
                  :value="value"
                  :label="`${value}`"
              /></el-select>
            </el-form-item>
            <el-form-item :label="DamengT('extentSize')">
              <el-select v-model="settings.extentSize"
                ><el-option
                  v-for="value in DAMENG_LIMITS.extentSizes"
                  :key="value"
                  :value="value"
                  :label="`${value}`"
              /></el-select>
            </el-form-item>
            <el-form-item :label="DamengT('charset')">
              <el-select v-model="settings.charset"
                ><el-option :value="0" label="GB18030" /><el-option
                  :value="1"
                  label="UTF-8" /><el-option :value="2" label="EUC-KR"
              /></el-select>
            </el-form-item>
            <el-form-item :label="DamengT('caseSensitive')"
              ><el-switch v-model="settings.caseSensitive"
            /></el-form-item>
          </div>
          <el-divider content-position="left">{{ DamengT('resourceDefaults') }}</el-divider>
          <div class="grid grid-cols-2 gap-x-6">
            <el-form-item :label="DamengT('port')"
              ><el-input-number
                v-model="settings.port"
                :min="DAMENG_LIMITS.port.min"
                :max="DAMENG_LIMITS.port.max"
            /></el-form-item>
            <el-form-item :label="DamengT('bufferMB')"
              ><el-input-number
                v-model="settings.bufferMB"
                :min="DAMENG_LIMITS.bufferMB.min"
                :max="DAMENG_LIMITS.bufferMB.max"
                :step="8"
            /></el-form-item>
            <el-form-item :label="DamengT('logSizeMB')"
              ><el-input-number
                v-model="settings.logSizeMB"
                :min="DAMENG_LIMITS.logSizeMB.min"
                :max="DAMENG_LIMITS.logSizeMB.max"
                :step="64"
            /></el-form-item>
          </div>
          <p class="text-sm">{{
            DamengT('resourceEstimate', {
              memory: settings.bufferMB,
              disk:
                settings.logSizeMB * DAMENG_INITIAL_STORAGE.redoLogCount +
                DAMENG_INITIAL_STORAGE.tablespaceMB * DAMENG_INITIAL_STORAGE.tablespaceCount
            })
          }}</p>
          <p class="mt-2 text-xs opacity-70">{{ DamengT('resourceUnverified') }}</p>
        </el-form>
        <p v-if="error" class="text-sm text-red-500" role="alert">{{ error }}</p>
      </div>
    </el-scrollbar>
    <template #footer>
      <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="submit">{{
        DamengT(resuming ? 'resumeInitialization' : target ? 'initialize' : 'settings')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { MessageError } from '@/util/Element'
  import {
    DamengManager,
    copySettings,
    initialCredentialError,
    generateInitialPassword,
    type DamengInstalled
  } from './store'
  import { defaultDamengSettings, DAMENG_LIMITS, DAMENG_INITIAL_STORAGE } from '../shared'
  import { DamengT } from './lang'

  const props = defineProps<{ initialTarget?: DamengInstalled; startup?: boolean }>()
  const show = ref(false)
  const error = ref('')
  let submitted: (value: boolean) => void = () => {}
  let closedFn: () => void = () => {}
  let settled = false
  const onSubmit = (fn: typeof submitted) => {
    submitted = fn
  }
  const onClosed = (fn: typeof closedFn) => {
    closedFn = fn
  }
  const settle = (result: boolean) => {
    if (!props.startup || settled) return
    settled = true
    submitted(result)
  }
  const closed = () => {
    clearPasswords()
    settle(false)
    closedFn()
  }
  watch(
    show,
    (value) => {
      if (!value) settle(false)
    },
    { flush: 'sync' }
  )
  onBeforeUnmount(() => settle(false))
  const saving = ref(false)
  const target = ref<DamengInstalled>()
  const resuming = computed(
    () =>
      !!target.value?.damengRuntime?.initializationCompleted &&
      !target.value?.damengRuntime?.initialized
  )
  const settings = ref(defaultDamengSettings())
  const credentials = ref({ sysdbaPassword: '', auditorPassword: '' })
  const clearPasswords = () => {
    credentials.value = { sysdbaPassword: '', auditorPassword: '' }
  }
  const open = async (item?: DamengInstalled) => {
    await DamengManager.init()
    target.value = item
    settings.value = copySettings(DamengManager.settings)
    credentials.value =
      item && !resuming.value
        ? { sysdbaPassword: '', auditorPassword: '' }
        : { ...DamengManager.credentials }
    error.value = ''
    settled = false
    show.value = true
  }
  const generate = (field: 'sysdbaPassword' | 'auditorPassword') => {
    credentials.value[field] = generateInitialPassword()
    error.value = ''
  }
  onMounted(() => {
    if (props.startup)
      open(props.initialTarget).catch(() => {
        settle(false)
        closedFn()
      })
  })
  const submit = async () => {
    if (saving.value) return
    const item = target.value
    const snapshot = { ...copySettings(settings.value), ...credentials.value }
    error.value = item && !resuming.value ? initialCredentialError(credentials.value) : ''
    if (error.value) return
    saving.value = true
    try {
      if (item) {
        const initialized = await DamengManager.initialize(
          item,
          resuming.value ? undefined : snapshot,
          !!props.startup
        )
        if (!initialized) {
          error.value = DamengManager.state(item)?.error ?? DamengT('operationFailed')
          return
        }
      } else {
        await DamengManager.saveSettings(snapshot, snapshot)
      }
      settle(true)
      show.value = false
    } catch (failure) {
      MessageError(failure instanceof Error ? failure.message : `${failure}`)
    } finally {
      saving.value = false
    }
  }
  defineExpose({ open, show, onSubmit, onClosed })
</script>

<style lang="scss">
  .dameng-setup-dialog {
    height: 75vh;
    display: flex;
    flex-direction: column;

    .el-dialog__body {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
  }
</style>
