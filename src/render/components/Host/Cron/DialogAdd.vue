<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? I18nT('base.edit') : I18nT('cron.add')"
    width="860px"
    @close="handleClose"
  >
    <div class="dialog-grid">
      <div class="form-pane">
        <el-form ref="formRef" :model="form" :rules="rules" label-width="106px">
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
              <el-button @click="showScheduleHelper = true" type="primary" link>
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
                {{ preset.label }}
              </el-tag>
            </div>

            <div class="mt-2 text-xs text-gray-500">
              {{ I18nT('cron.scheduleFormat') }}: <code>* * * * *</code>
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
            />
            <div class="mt-1 text-xs" style="color: var(--el-text-color-secondary)">{{ I18nT('cron.workDirTip') }}</div>
          </el-form-item>

          <el-form-item :label="I18nT('cron.enabled')" prop="enabled">
            <el-switch v-model="form.enabled" />
          </el-form-item>
        </el-form>
      </div>

      <div class="preview-pane">
        <div class="preview-card">
          <div class="preview-title">Live Preview</div>
          <el-tag :type="scheduleValid ? 'success' : 'danger'" effect="dark">
            {{ scheduleValid ? 'Valid cron expression' : 'Cron expression must contain 5 parts' }}
          </el-tag>

          <div class="parts-grid mt-3">
            <div class="part-item" v-for="(label, idx) in cronPartLabels" :key="label">
              <div class="part-label">{{ label }}</div>
              <div class="part-value">{{ cronParts[idx] || '-' }}</div>
            </div>
          </div>

          <div class="preview-sub mt-3">
            Status: <strong>{{ form.enabled ? 'Enabled' : 'Disabled' }}</strong>
          </div>
        </div>

        <div class="preview-card mt-3">
          <div class="preview-title">{{ I18nT('cron.runTest') }}</div>
          <el-button type="warning" size="small" :loading="testRunning" @click="runTest" :disabled="!form.command">
            {{ testRunning ? I18nT('cron.running') : I18nT('cron.runTest') }}
          </el-button>
          <div v-if="testResult" class="output-block mt-2">
            <div class="output-meta">
              <el-tag :type="testResult.exitCode === 0 ? 'success' : 'danger'" size="small">
                {{ testResult.exitCode === 0 ? I18nT('cron.runSuccess') : I18nT('cron.runFailed') }}
              </el-tag>
              <span class="ml-2 text-xs">{{ I18nT('cron.exitCode') }}: {{ testResult.exitCode }}</span>
              <span class="ml-2 text-xs">{{ I18nT('cron.duration') }}: {{ testResult.duration }}ms</span>
              <el-button text size="small" @click="testResult = null" class="ml-auto">{{ I18nT('cron.clearOutput') }}</el-button>
            </div>
            <pre class="output-pre">{{ testResult.output || testResult.error || I18nT('cron.noOutput') }}</pre>
          </div>
        </div>

        <div class="preview-card mt-3">
          <div class="preview-title">Quick Command Templates</div>
          <div class="command-preset-wrap">
            <el-button
              v-for="item in commandPresets"
              :key="item.label"
              size="small"
              plain
              @click="applyCommandPreset(item.command)"
            >
              {{ item.label }}
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="resetForm" plain>Reset</el-button>
        <el-button @click="handleClose">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          {{ isEdit ? I18nT('base.save') : I18nT('base.add') }}
        </el-button>
      </div>
    </template>
  </el-dialog>

  <ScheduleHelper v-if="showScheduleHelper" @select="form.schedule = $event; showScheduleHelper = false" />
</template>

<script setup lang="ts">
  import { ref, reactive, computed, watch } from 'vue'
  import type { FormInstance, FormRules } from 'element-plus'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'
  import { MessageSuccess, MessageError } from '@/util/Element'
  import type { CronJob } from '@shared/app'
  import { AppStore } from '@/store/app'
  import ScheduleHelper from './ScheduleHelper.vue'

  const props = defineProps<{
    hostId: number
    item: CronJob | null
  }>()

  const emit = defineEmits<{
    refresh: []
    close: []
  }>()

  const isEdit = computed(() => !!props.item)
  const visible = ref(true)
  const submitting = ref(false)
  const showScheduleHelper = ref(false)
  const formRef = ref<FormInstance>()
  const cronPartLabels = ['Minute', 'Hour', 'Day', 'Month', 'Weekday']

  const schedulePresets = [
    { label: 'Every minute', value: '* * * * *' },
    { label: 'Hourly', value: '0 * * * *' },
    { label: 'Daily 00:00', value: '0 0 * * *' },
    { label: 'Weekdays 09:00', value: '0 9 * * 1-5' }
  ]

  const commandPresets = [
    { label: 'PHP Artisan', command: 'php artisan schedule:run' },
    { label: 'Node Script', command: 'node ./scripts/cron.js' },
    { label: 'Python Script', command: 'python ./scripts/cron.py' },
    { label: 'Shell Script', command: 'bash ./scripts/cron.sh' }
  ]

  const testRunning = ref(false)
  const testResult = ref<{ output: string; error: string; exitCode: number; duration: number } | null>(null)
  const hostRoot = computed(() => AppStore().hosts.find((h) => h.id === props.hostId)?.root ?? '')

  const form = reactive({
    name: '',
    schedule: '',
    command: '',
    description: '',
    workDir: '',
    enabled: true
  })

  const rules: FormRules = {
    name: [
      { required: true, message: I18nT('cron.nameRequired'), trigger: 'blur' },
      { min: 1, max: 100, message: I18nT('cron.nameLengthError'), trigger: 'blur' }
    ],
    schedule: [
      { required: true, message: I18nT('cron.scheduleRequired'), trigger: 'blur' },
      {
        validator: (_rule: any, value: string, callback: any) => {
          const count = value.trim().split(/\s+/).filter(Boolean).length
          if (count !== 5) {
            callback(new Error(I18nT('cron.scheduleRequired')))
            return
          }
          callback()
        },
        trigger: 'blur'
      }
    ],
    command: [
      { required: true, message: I18nT('cron.commandRequired'), trigger: 'blur' }
    ]
  }

  const cronParts = computed(() => {
    return form.schedule.trim().split(/\s+/).filter(Boolean)
  })

  const scheduleValid = computed(() => cronParts.value.length === 5)

  watch(
    () => props.item,
    (newItem) => {
      if (newItem) {
        form.name = newItem.name
        form.schedule = newItem.schedule
        form.command = newItem.command
        form.description = newItem.description || ''
        form.workDir = newItem.workDir || hostRoot.value
        form.enabled = newItem.enabled
      } else {
        form.workDir = hostRoot.value
      }
    },
    { immediate: true }
  )

  const applySchedulePreset = (value: string) => {
    form.schedule = value
  }

  const applyCommandPreset = (value: string) => {
    form.command = value
  }

  const resetForm = () => {
    if (isEdit.value && props.item) {
      form.name = props.item.name
      form.schedule = props.item.schedule
      form.command = props.item.command
      form.description = props.item.description || ''
      form.workDir = props.item.workDir || hostRoot.value
      form.enabled = props.item.enabled
      return
    }

    form.name = ''
    form.schedule = ''
    form.command = ''
    form.description = ''
    form.workDir = hostRoot.value
    form.enabled = true
    testResult.value = null
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
    if (isEdit.value && props.item) {
      IPC.send('app-fork:cron', 'updateCronJob', props.hostId, props.item.id, { ...form, workDir: normalizedWorkDir }).then(
        (key: string, res: any) => {
          IPC.off(key)
          submitting.value = false
          if (res?.code === 0) {
            MessageSuccess(I18nT('base.updateSuccess'))
            emit('refresh')
            handleClose()
          } else if (res?.code === 1) {
            MessageError(res.msg || I18nT('base.operationFailed'))
          }
        }
      )
    } else {
      IPC.send('app-fork:cron', 'addCronJob', props.hostId, { ...form, workDir: normalizedWorkDir }).then(
        (key: string, res: any) => {
          IPC.off(key)
          submitting.value = false
          if (res?.code === 0) {
            MessageSuccess(I18nT('base.addSuccess'))
            emit('refresh')
            handleClose()
          } else if (res?.code === 1) {
            MessageError(res.msg || I18nT('base.operationFailed'))
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
    grid-template-columns: 1.4fr 1fr;
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

    .preview-card {
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 12px;
      padding: 12px;
      background: linear-gradient(180deg, var(--el-bg-color-overlay) 0%, var(--el-fill-color-light) 100%);

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
          border-radius: 8px;
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
