<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? I18nT('base.edit') : I18nT('cron.add')"
    width="860px"
    class="el-dialog-content-flex-1 h-[75%] dark:bg-[#1d2033]"
    @close="handleClose"
  >
    <el-scrollbar>
      <div class="dialog-grid">
        <div class="form-pane">
          <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
            <el-form-item v-if="!targetFixed" :label="I18nT('cron.scope')" prop="scope">
              <el-radio-group v-model="form.scope">
                <el-radio-button value="global">{{ I18nT('cron.global') }}</el-radio-button>
                <el-radio-button value="host">{{ I18nT('cron.siteTask') }}</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <el-form-item
              v-if="!targetFixed && form.scope === 'host'"
              :label="I18nT('host.site')"
              prop="hostId"
            >
              <el-select v-model="form.hostId" class="w-full" filterable>
                <el-option
                  v-for="host in hosts"
                  :key="host.id"
                  :label="host.name"
                  :value="host.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item :label="I18nT('cron.name')" prop="name">
              <el-input
                v-model="form.name"
                :placeholder="I18nT('cron.namePlaceholder')"
                maxlength="100"
                show-word-limit
              />
            </el-form-item>

            <el-form-item :label="I18nT('cron.schedule')" prop="schedule">
              <div class="schedule-input">
                <el-input
                  v-model="form.schedule"
                  :placeholder="I18nT('cron.schedulePlaceholder')"
                  class="flex-1"
                />
                <el-button type="primary" link @click="showScheduleHelper = true">
                  {{ I18nT('cron.helper') }}
                </el-button>
              </div>

              <div class="preset-row">
                <el-tag
                  v-for="preset in schedulePresets"
                  :key="preset.value"
                  size="small"
                  effect="plain"
                  class="preset-tag"
                  @click="applySchedulePreset(preset.value)"
                >
                  {{ I18nT(preset.labelKey) }}
                </el-tag>
              </div>

              <div class="mt-2 text-xs text-gray-500">
                {{ I18nT('cron.scheduleFormat') }}: <code>* * * * *</code>
              </div>
              <div class="mt-1 text-xs text-gray-500">
                {{ I18nT('cron.scheduleAdvancedTip') }}
              </div>
            </el-form-item>

            <el-form-item :label="I18nT('cron.command')" prop="command">
              <el-input
                v-model="form.command"
                :placeholder="I18nT('cron.commandPlaceholder')"
                type="textarea"
                rows="4"
                show-word-limit
                maxlength="1000"
              />
            </el-form-item>

            <el-form-item :label="I18nT('cron.description')" prop="description">
              <el-input
                v-model="form.description"
                :placeholder="I18nT('cron.descriptionPlaceholder')"
                type="textarea"
                rows="2"
                maxlength="500"
                show-word-limit
              />
            </el-form-item>

            <el-form-item :label="I18nT('cron.workDir')" prop="workDir">
              <el-input
                v-model="form.workDir"
                :placeholder="I18nT('cron.workDirPlaceholder')"
                clearable
              >
                <template #append>
                  <el-tooltip :content="I18nT('base.open')" placement="top">
                    <el-button :icon="FolderOpened" @click="chooseWorkDir" />
                  </el-tooltip>
                </template>
              </el-input>
              <div class="mt-1 text-xs" style="color: var(--el-text-color-secondary)">{{
                I18nT('cron.workDirTip')
              }}</div>
            </el-form-item>

            <el-form-item :label="I18nT('cron.enabled')" prop="enabled">
              <el-switch v-model="form.enabled" />
            </el-form-item>
          </el-form>
        </div>
        <div class="preview-pane">
          <div class="preview-card schedule-preview">
            <div class="preview-title">{{ I18nT('cron.livePreview') }}</div>
            <el-tag :type="scheduleValid ? 'success' : 'danger'" effect="dark">
              {{
                scheduleValid
                  ? I18nT('cron.validExpression')
                  : `${I18nT('cron.scheduleInvalid')}: ${scheduleValidation.error || ''}`
              }}
            </el-tag>

            <div class="parts-grid mt-3">
              <div v-for="(label, idx) in cronPartLabels" :key="label" class="part-item">
                <div class="part-label">{{ label }}</div>
                <div class="part-value">{{ cronParts[idx] || '-' }}</div>
              </div>
            </div>

            <div class="preview-sub mt-3">
              {{ I18nT('cron.status') }}:
              <strong>{{ form.enabled ? I18nT('cron.enabled') : I18nT('cron.disabled') }}</strong>
            </div>
          </div>

          <div class="preview-card mt-3">
            <div class="preview-title">{{ I18nT('cron.runTest') }}</div>
            <el-button
              type="warning"
              size="small"
              :loading="testRunning"
              :disabled="!form.command"
              @click="runTest"
            >
              {{ testRunning ? I18nT('cron.running') : I18nT('cron.runTest') }}
            </el-button>
            <div v-if="testResult" class="output-block mt-2">
              <div class="output-meta">
                <el-tag :type="testResult.exitCode === 0 ? 'success' : 'danger'" size="small">
                  {{
                    testResult.exitCode === 0 ? I18nT('cron.runSuccess') : I18nT('cron.runFailed')
                  }}
                </el-tag>
                <span class="ml-2 text-xs"
                  >{{ I18nT('cron.exitCode') }}: {{ testResult.exitCode }}</span
                >
                <span class="ml-2 text-xs"
                  >{{ I18nT('cron.duration') }}: {{ testResult.duration }}ms</span
                >
                <el-button text size="small" class="ml-auto" @click="testResult = null">{{
                  I18nT('cron.clearOutput')
                }}</el-button>
              </div>
              <pre class="output-pre">{{
                testResult.output || testResult.error || I18nT('cron.noOutput')
              }}</pre>
            </div>
          </div>

          <div class="preview-card mt-3">
            <div class="preview-title">{{ I18nT('cron.commandTemplates') }}</div>
            <div class="command-preset-wrap">
              <el-button
                v-for="preset in commandPresets"
                :key="preset.labelKey"
                size="small"
                plain
                @click="applyCommandPreset(preset.command)"
              >
                {{ I18nT(preset.labelKey) }}
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>

    <template #footer>
      <div class="dialog-footer">
        <el-button plain @click="resetForm">Reset</el-button>
        <el-button @click="handleClose">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ isEdit ? I18nT('base.save') : I18nT('base.add') }}
        </el-button>
      </div>
    </template>
  </el-dialog>

  <ScheduleHelper
    v-if="showScheduleHelper"
    @select="handleScheduleSelect"
    @close="showScheduleHelper = false"
  />
</template>

<script setup lang="ts">
  import { ref, reactive, computed, watch, nextTick } from 'vue'
  import type { FormInstance, FormRules } from 'element-plus'
  import { FolderOpened } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'
  import { dialog } from '@/util/NodeFn'
  import { MessageSuccess, MessageError } from '@/util/Element'
  import type { CronJob } from '@shared/app'
  import { validatePortableCronExpression } from '@shared/CronExpression'
  import { AppStore } from '@/store/app'
  import ScheduleHelper from './ScheduleHelper.vue'

  const props = defineProps<{
    hostId?: number
    item: CronJob | null
  }>()

  const emit = defineEmits<{
    refresh: []
    close: []
  }>()

  const isEdit = computed(() => !!props.item)
  const appStore = AppStore()
  const visible = ref(true)
  const submitting = ref(false)
  const showScheduleHelper = ref(false)
  const formRef = ref<FormInstance>()
  const hydratingForm = ref(false)
  type I18nKey = Parameters<typeof I18nT>[0]

  const cronPartLabels = [
    I18nT('cron.fieldMinute'),
    I18nT('cron.fieldHour'),
    I18nT('cron.fieldDay'),
    I18nT('cron.fieldMonth'),
    I18nT('cron.fieldWeekday')
  ]

  const schedulePresets: Array<{ labelKey: I18nKey; value: string }> = [
    { labelKey: 'cron.presetEveryMinute', value: '* * * * *' },
    { labelKey: 'cron.presetEveryHour', value: '0 * * * *' },
    { labelKey: 'cron.presetDailyMidnight', value: '0 0 * * *' },
    { labelKey: 'cron.presetWeekdays9', value: '0 9 * * 1-5' }
  ]

  const commandPresets: Array<{ labelKey: I18nKey; command: string }> = [
    { labelKey: 'cron.commandPresetPhpArtisan', command: 'php artisan schedule:run' },
    { labelKey: 'cron.commandPresetNodeScript', command: 'node ./scripts/cron.js' },
    { labelKey: 'cron.commandPresetPythonScript', command: 'python ./scripts/cron.py' },
    { labelKey: 'cron.commandPresetShellScript', command: 'bash ./scripts/cron.sh' }
  ]

  const testRunning = ref(false)
  const testResult = ref<{
    output: string
    error: string
    exitCode: number
    duration: number
  } | null>(null)
  const hosts = computed(() => appStore.hosts)
  const targetFixed = computed(() => typeof props.hostId === 'number')

  const form = reactive({
    scope: 'global' as 'global' | 'host',
    hostId: undefined as number | undefined,
    name: '',
    schedule: '',
    command: '',
    description: '',
    workDir: '',
    enabled: true
  })

  const hostRoot = computed(() => {
    const selectedHostId =
      form.hostId ?? (props.hostId && props.hostId > 0 ? props.hostId : undefined)
    return hosts.value.find((host) => host.id === selectedHostId)?.root ?? ''
  })

  const rules: FormRules = {
    hostId: [
      {
        validator: (_rule: any, value: number | undefined, callback: any) => {
          if (form.scope === 'host' && !value) {
            callback(new Error(I18nT('cron.siteRequired')))
            return
          }
          callback()
        },
        trigger: 'change'
      }
    ],
    name: [
      { required: true, message: I18nT('cron.nameRequired'), trigger: 'blur' },
      { min: 1, max: 100, message: I18nT('cron.nameLengthError'), trigger: 'blur' }
    ],
    schedule: [
      { required: true, message: I18nT('cron.scheduleRequired'), trigger: 'blur' },
      {
        validator: (_rule: any, value: string, callback: any) => {
          const result = validatePortableCronExpression(value || '')
          if (!result.valid) {
            callback(new Error(`${I18nT('cron.scheduleInvalid')}: ${result.error}`))
            return
          }
          callback()
        },
        trigger: 'blur'
      }
    ],
    command: [{ required: true, message: I18nT('cron.commandRequired'), trigger: 'blur' }]
  }

  const cronParts = computed(() => {
    return form.schedule.trim().split(/\s+/).filter(Boolean)
  })

  const scheduleValidation = computed(() => validatePortableCronExpression(form.schedule))

  const scheduleValid = computed(() => scheduleValidation.value.valid)

  const fillWorkDirFromHost = () => {
    if (form.scope === 'host' && hostRoot.value) {
      form.workDir = hostRoot.value
    }
  }

  const hydrateForm = (handler: () => void) => {
    hydratingForm.value = true
    handler()
    nextTick(() => {
      hydratingForm.value = false
    }).catch()
  }

  watch(
    () => props.item,
    (newItem) => {
      hydrateForm(() => {
        if (newItem) {
          form.scope = newItem.scope ?? (newItem.hostId ? 'host' : 'global')
          form.hostId = newItem.hostId
          form.name = newItem.name
          form.schedule = newItem.schedule
          form.command = newItem.command
          form.description = newItem.description || ''
          form.workDir = newItem.workDir || hostRoot.value
          form.enabled = newItem.enabled
        } else {
          form.scope = props.hostId && props.hostId > 0 ? 'host' : 'global'
          form.hostId = props.hostId && props.hostId > 0 ? props.hostId : undefined
          form.workDir = hostRoot.value
        }
      })
    },
    { immediate: true }
  )

  watch(
    () => form.hostId,
    (newId, oldId) => {
      if (hydratingForm.value || newId === oldId) {
        return
      }
      fillWorkDirFromHost()
    }
  )

  watch(
    () => form.scope,
    (scope, oldScope) => {
      if (hydratingForm.value || scope === oldScope) {
        return
      }
      fillWorkDirFromHost()
    }
  )

  const applySchedulePreset = (value: string) => {
    const result = validatePortableCronExpression(value)
    if (!result.valid) {
      MessageError(`${I18nT('cron.scheduleInvalid')}: ${result.error}`)
      return
    }
    form.schedule = value
  }

  const handleScheduleSelect = (value: string) => {
    form.schedule = value
    showScheduleHelper.value = false
  }

  const applyCommandPreset = (value: string) => {
    form.command = value
  }

  const chooseWorkDir = async () => {
    const defaultPath = form.workDir || hostRoot.value
    const options = {
      properties: ['openDirectory', 'createDirectory', 'showHiddenFiles'],
      ...(defaultPath ? { defaultPath } : {})
    } satisfies Electron.OpenDialogOptions
    const { canceled, filePaths } = await dialog.showOpenDialog(options)
    if (!canceled && filePaths?.length) {
      form.workDir = filePaths[0]
    }
  }

  const resetForm = () => {
    hydrateForm(() => {
      if (isEdit.value && props.item) {
        form.scope = props.item.scope ?? (props.item.hostId ? 'host' : 'global')
        form.hostId = props.item.hostId
        form.name = props.item.name
        form.schedule = props.item.schedule
        form.command = props.item.command
        form.description = props.item.description || ''
        form.workDir = props.item.workDir || hostRoot.value
        form.enabled = props.item.enabled
        return
      }

      form.scope = props.hostId && props.hostId > 0 ? 'host' : 'global'
      form.hostId = props.hostId && props.hostId > 0 ? props.hostId : undefined
      form.name = ''
      form.schedule = ''
      form.command = ''
      form.description = ''
      form.workDir = hostRoot.value
      form.enabled = true
      testResult.value = null
    })
  }

  const runTest = () => {
    if (!form.command) return
    testRunning.value = true
    testResult.value = null
    const workDir = form.workDir || hostRoot.value
    IPC.send('app-fork:cron', 'runCommand', workDir, form.command).then((key: string, res: any) => {
      IPC.off(key)
      testRunning.value = false
      if (res?.code === 0) {
        testResult.value = res.data
      } else {
        testResult.value = { output: '', error: res?.msg || 'Failed', exitCode: 1, duration: 0 }
      }
    })
  }

  const handleSubmit = async () => {
    if (!formRef.value) return

    await formRef.value.validate().catch(() => null)
    if (formRef.value.fields.some((f) => f.validateState === 'error')) {
      return
    }

    submitting.value = true
    const normalizedWorkDir = form.workDir.trim() || hostRoot.value
    const targetHostId = form.scope === 'host' ? (form.hostId ?? props.hostId ?? 0) : 0
    const payload = {
      name: form.name,
      schedule: form.schedule,
      command: form.command,
      description: form.description,
      workDir: normalizedWorkDir,
      enabled: form.enabled,
      scope: form.scope,
      hostId: targetHostId || undefined
    }
    if (isEdit.value && props.item) {
      const sourceHostId = props.item.hostId ?? props.hostId ?? 0
      IPC.send('app-fork:cron', 'updateCronJob', sourceHostId, props.item.id, payload).then(
        (key: string, res: any) => {
          IPC.off(key)
          submitting.value = false
          if (res?.code === 0) {
            MessageSuccess(I18nT('base.success'))
            emit('refresh')
            handleClose()
          } else if (res?.code === 1) {
            MessageError(res.msg || I18nT('base.fail'))
          }
        }
      )
    } else {
      IPC.send('app-fork:cron', 'addCronJob', targetHostId, payload).then(
        (key: string, res: any) => {
          IPC.off(key)
          submitting.value = false
          if (res?.code === 0) {
            MessageSuccess(I18nT('base.success'))
            emit('refresh')
            handleClose()
          } else if (res?.code === 1) {
            MessageError(res.msg || I18nT('base.fail'))
          }
        }
      )
    }
  }

  const handleClose = () => {
    visible.value = false
    setTimeout(() => {
      emit('close')
    }, 200)
  }
</script>

<style scoped lang="scss">
  .dialog-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.9fr);
    gap: 16px;

    .form-pane,
    .preview-pane {
      min-width: 0;
    }

    .schedule-input {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .preset-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;

      .preset-tag {
        cursor: pointer;
      }
    }

    .preview-pane {
      .preview-card {
        &:first-child {
          margin-top: 0 !important;
        }
      }
    }

    .preview-card {
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 8px;
      padding: 12px;
      background: linear-gradient(
        180deg,
        var(--el-bg-color-overlay) 0%,
        var(--el-fill-color-light) 100%
      );

      .preview-title {
        font-weight: 700;
        margin-bottom: 8px;
      }

      .parts-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;

        .part-item {
          border: 1px solid var(--el-border-color-lighter);
          border-radius: 6px;
          padding: 8px;
          background: var(--el-bg-color-overlay);

          .part-label {
            font-size: 11px;
            color: var(--el-text-color-secondary);
            text-transform: uppercase;
            letter-spacing: 0.6px;
          }

          .part-value {
            margin-top: 2px;
            font-weight: 700;
            font-family: 'Consolas', 'Courier New', monospace;
          }
        }
      }

      .preview-sub {
        font-size: 13px;
      }

      .command-preset-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .output-block {
        .output-meta {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          margin-bottom: 6px;
        }

        .output-pre {
          background: var(--el-fill-color);
          border: 1px solid var(--el-border-color-lighter);
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 12px;
          font-family: 'Consolas', 'Courier New', monospace;
          max-height: 150px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-all;
          margin: 0;
        }
      }
    }
  }

  @media (max-width: 980px) {
    .dialog-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
