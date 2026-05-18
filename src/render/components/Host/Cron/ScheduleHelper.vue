<template>
  <el-dialog
    v-model="visible"
    :title="I18nT('cron.helper')"
    width="600px"
    class="schedule-helper-dialog"
    @close="$emit('close')"
  >
    <div class="helper-wrap">
      <!-- Live expression display -->
      <div class="expr-display">
        <div class="expr-label">{{ I18nT('cron.expression') }}</div>
        <div class="expr-value">
          <span
            v-for="(part, i) in partValues"
            :key="i"
            class="expr-part"
            :class="{ active: activeField === i }"
          >
            {{ part }}
          </span>
        </div>
        <div class="expr-legend">
          <span
            v-for="(lbl, i) in fieldLabels"
            :key="i"
            :class="{ active: activeField === i }"
            @click="activeField = i"
          >
            {{ lbl }}
          </span>
        </div>
        <div v-if="description" class="expr-desc">
          <el-icon><Clock /></el-icon>
          {{ description }}
        </div>
      </div>

      <!-- Presets -->
      <div class="section-title">{{ I18nT('cron.presets') }}</div>
      <div class="presets-grid">
        <div
          v-for="preset in presets"
          :key="preset.value"
          class="preset-card"
          :class="{ selected: generatedSchedule === preset.value }"
          @click="applyPreset(preset)"
        >
          <div class="preset-icon">{{ preset.icon }}</div>
          <div class="preset-name">{{ preset.name }}</div>
          <div class="preset-expr">{{ preset.value }}</div>
        </div>
      </div>

      <!-- Field editor -->
      <div class="section-title">{{ I18nT('cron.custom') }}</div>
      <div class="field-tabs">
        <div
          v-for="(field, i) in fields"
          :key="i"
          class="field-tab"
          :class="{ active: activeField === i }"
          @click="activeField = i"
        >
          <span class="tab-label">{{ fieldLabels[i] }}</span>
          <span class="tab-value">{{ partValues[i] }}</span>
        </div>
      </div>

      <div class="field-editor">
        <div class="editor-title">{{ fieldLabels[activeField] }}</div>
        <div class="editor-hint">{{ fields[activeField].hint }}</div>

        <div class="editor-options">
          <div class="option-group">
            <el-radio-group v-model="fields[activeField].mode">
              <el-radio value="any">Any (*)</el-radio>
              <el-radio value="every">Every N</el-radio>
              <el-radio value="specific">Specific</el-radio>
              <el-radio value="range">Range</el-radio>
            </el-radio-group>
          </div>

          <div v-if="fields[activeField].mode === 'every'" class="mode-config">
            <el-input-number
              v-model="fields[activeField].everyN"
              :min="1"
              :max="fields[activeField].max"
              controls-position="right"
            />
            <span class="ml-2 text-sm text-gray-500">{{ fields[activeField].unit }}</span>
          </div>

          <div v-if="fields[activeField].mode === 'specific'" class="mode-config">
            <div class="value-chips">
              <div
                v-for="v in fields[activeField].options"
                :key="v.value"
                class="chip"
                :class="{ selected: fields[activeField].specific.includes(v.value) }"
                @click="toggleSpecific(v.value)"
              >
                {{ v.label }}
              </div>
            </div>
          </div>

          <div v-if="fields[activeField].mode === 'range'" class="mode-config range-inputs">
            <el-input-number
              v-model="fields[activeField].rangeFrom"
              :min="fields[activeField].min"
              :max="fields[activeField].max - 1"
              controls-position="right"
            />
            <span class="range-sep">–</span>
            <el-input-number
              v-model="fields[activeField].rangeTo"
              :min="fields[activeField].min + 1"
              :max="fields[activeField].max"
              controls-position="right"
            />
          </div>
        </div>
      </div>

      <div class="hidden-old" style="display: none">
        <h4>{{ I18nT('cron.presets') }}</h4>
        <div>
          <el-button
            v-for="preset in presetsLegacy"
            :key="preset.value"
            size="small"
            @click="selectPreset(preset)"
          >
            {{ preset.label }}
          </el-button>
        </div>
      </div>

      <el-divider class="hidden-old" style="display: none" />

      <div class="hidden-old" style="display: none">
        <h4>{{ I18nT('cron.custom') }}</h4>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ I18nT('base.cancel') }}</el-button>
      <el-button type="primary" @click="applySchedule">{{ I18nT('base.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { Clock } from '@element-plus/icons-vue'

  const emit = defineEmits<{
    select: [schedule: string]
    close: []
  }>()

  const visible = ref(true)
  const activeField = ref(0)
  const fieldLabels = ['Minute', 'Hour', 'Day', 'Month', 'Weekday']

  interface FieldDef {
    mode: 'any' | 'every' | 'specific' | 'range'
    min: number
    max: number
    everyN: number
    specific: number[]
    rangeFrom: number
    rangeTo: number
    hint: string
    unit: string
    options: { label: string; value: number }[]
  }

  const makeOptions = (from: number, to: number, labels?: string[]) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      value: from + i,
      label: labels ? labels[i] : String(from + i)
    }))

  const monthLabels = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ]
  const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const fields = ref<FieldDef[]>([
    {
      mode: 'any',
      min: 0,
      max: 59,
      everyN: 5,
      specific: [],
      rangeFrom: 0,
      rangeTo: 59,
      hint: '0–59',
      unit: 'minutes',
      options: makeOptions(0, 59)
    },
    {
      mode: 'any',
      min: 0,
      max: 23,
      everyN: 1,
      specific: [],
      rangeFrom: 0,
      rangeTo: 23,
      hint: '0–23',
      unit: 'hours',
      options: makeOptions(0, 23)
    },
    {
      mode: 'any',
      min: 1,
      max: 31,
      everyN: 1,
      specific: [],
      rangeFrom: 1,
      rangeTo: 31,
      hint: '1–31',
      unit: 'days',
      options: makeOptions(1, 31)
    },
    {
      mode: 'any',
      min: 1,
      max: 12,
      everyN: 1,
      specific: [],
      rangeFrom: 1,
      rangeTo: 12,
      hint: '1–12',
      unit: 'months',
      options: makeOptions(1, 12, monthLabels)
    },
    {
      mode: 'any',
      min: 0,
      max: 6,
      everyN: 1,
      specific: [],
      rangeFrom: 0,
      rangeTo: 6,
      hint: '0=Sun … 6=Sat',
      unit: 'weekdays',
      options: makeOptions(0, 6, weekLabels)
    }
  ])

  const partValues = computed(() =>
    fields.value.map((f) => {
      if (f.mode === 'any') return '*'
      if (f.mode === 'every') return `*/${f.everyN}`
      if (f.mode === 'specific')
        return f.specific.length ? f.specific.sort((a, b) => a - b).join(',') : '*'
      if (f.mode === 'range') return `${f.rangeFrom}-${f.rangeTo}`
      return '*'
    })
  )

  const generatedSchedule = computed(() => partValues.value.join(' '))

  const description = computed(() => {
    if (generatedSchedule.value === '* * * * *') return 'Every minute'
    if (generatedSchedule.value === '0 * * * *') return 'Every hour'
    if (generatedSchedule.value === '0 0 * * *') return 'Every day at midnight'
    if (generatedSchedule.value === '0 0 * * 0') return 'Every Sunday at midnight'
    if (generatedSchedule.value === '0 0 1 * *') return 'First day of every month'
    if (generatedSchedule.value === '0 9 * * 1-5') return 'Weekdays at 9:00 AM'
    const [min, hr] = partValues.value
    const parts: string[] = []
    if (min.startsWith('*/')) parts.push(`every ${min.slice(2)} min`)
    else if (min !== '*') parts.push(`at minute ${min}`)
    if (hr.startsWith('*/')) parts.push(`every ${hr.slice(2)} hours`)
    else if (hr !== '*') parts.push(`at ${hr}:00`)
    return parts.join(', ')
  })

  interface Preset {
    name: string
    icon: string
    value: string
  }

  const presets: Preset[] = [
    { name: 'Every minute', icon: '1m', value: '* * * * *' },
    { name: 'Every hour', icon: '1h', value: '0 * * * *' },
    { name: 'Every 2 hours', icon: '2h', value: '0 */2 * * *' },
    { name: 'Daily midnight', icon: '0:00', value: '0 0 * * *' },
    { name: '6 AM daily', icon: '6:00', value: '0 6 * * *' },
    { name: '12 PM daily', icon: '12:00', value: '0 12 * * *' },
    { name: '6 PM daily', icon: '18:00', value: '0 18 * * *' },
    { name: 'Weekdays 9 AM', icon: '9-5', value: '0 9 * * 1-5' },
    { name: 'Every Sunday', icon: 'Sun', value: '0 0 * * 0' },
    { name: 'Monthly 1st', icon: '1st', value: '0 0 1 * *' },
    { name: 'Every 5 min', icon: '5m', value: '*/5 * * * *' },
    { name: 'Every 15 min', icon: '15m', value: '*/15 * * * *' }
  ]

  // kept for compatibility with legacy slot (hidden)
  const presetsLegacy = presets.map((p) => ({ label: p.name, value: p.value }))

  const toggleSpecific = (v: number) => {
    const f = fields.value[activeField.value]
    const idx = f.specific.indexOf(v)
    if (idx === -1) f.specific.push(v)
    else f.specific.splice(idx, 1)
  }

  const applyPreset = (preset: Preset) => {
    const parts = preset.value.split(' ')
    parts.forEach((part, i) => {
      const f = fields.value[i]
      if (part === '*') {
        f.mode = 'any'
      } else if (part.startsWith('*/')) {
        f.mode = 'every'
        f.everyN = parseInt(part.slice(2))
      } else if (part.includes('-')) {
        f.mode = 'range'
        const [a, b] = part.split('-').map(Number)
        f.rangeFrom = a
        f.rangeTo = b
      } else {
        f.mode = 'specific'
        f.specific = part.split(',').map(Number)
      }
    })
  }

  const selectPreset = (preset: { label: string; value: string }) => {
    emit('select', preset.value)
    visible.value = false
  }

  const applySchedule = () => {
    emit('select', generatedSchedule.value)
    visible.value = false
  }
</script>

<style lang="scss">
  .schedule-helper-dialog .el-dialog__body {
    padding-top: 10px;
  }
</style>

<style scoped lang="scss">
  .helper-wrap {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .expr-display {
      background: var(--el-fill-color-light);
      border: 1px solid var(--el-border-color);
      border-radius: 8px;
      padding: 10px 12px;

      .expr-label {
        font-size: 10px;
        color: var(--el-text-color-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
      }

      .expr-value {
        display: flex;
        gap: 6px;
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 2px;
        margin-bottom: 6px;

        .expr-part {
          color: var(--el-text-color-secondary);
          transition: color 0.15s;
          &.active {
            color: var(--el-color-primary);
          }
        }
      }

      .expr-legend {
        display: flex;
        gap: 6px;
        font-size: 10px;
        flex-wrap: wrap;
        span {
          cursor: pointer;
          padding: 2px 5px;
          border-radius: 4px;
          transition: background 0.15s;
          color: var(--el-text-color-placeholder);
          &.active {
            color: var(--el-color-primary);
            background: var(--el-color-primary-light-9);
          }
          &:hover {
            background: var(--el-fill-color);
          }
        }
      }

      .expr-desc {
        margin-top: 6px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        display: flex;
        align-items: center;
        gap: 4px;
      }
    }

    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--el-text-color-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }

    .presets-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;

      .preset-card {
        border: 1px solid var(--el-border-color);
        border-radius: 6px;
        padding: 8px 6px;
        cursor: pointer;
        transition: all 0.15s;
        background: var(--el-bg-color-overlay);
        text-align: center;
        &:hover {
          border-color: var(--el-color-primary);
        }
        &.selected {
          border-color: var(--el-color-primary);
          background: var(--el-color-primary-light-9);
        }
        .preset-icon {
          font-size: 12px;
          font-weight: 800;
          font-family: 'Consolas', monospace;
          color: var(--el-color-primary);
          margin-bottom: 3px;
          line-height: 1;
          letter-spacing: 0;
        }
        .preset-name {
          font-size: 11px;
          font-weight: 600;
          color: var(--el-text-color-primary);
        }
        .preset-expr {
          font-size: 9px;
          color: var(--el-text-color-placeholder);
          font-family: 'Consolas', monospace;
          margin-top: 2px;
        }
      }
    }

    .field-tabs {
      display: flex;
      border: 1px solid var(--el-border-color);
      border-radius: 8px;
      overflow: hidden;

      .field-tab {
        flex: 1;
        padding: 6px 4px;
        cursor: pointer;
        text-align: center;
        background: var(--el-bg-color-overlay);
        border-right: 1px solid var(--el-border-color);
        transition: background 0.15s;
        &:last-child {
          border-right: none;
        }
        &.active {
          background: var(--el-color-primary-light-8);
          border-bottom: 2px solid var(--el-color-primary);
        }
        .tab-label {
          display: block;
          font-size: 10px;
          color: var(--el-text-color-secondary);
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .tab-value {
          display: block;
          font-size: 13px;
          font-weight: 700;
          font-family: 'Consolas', monospace;
          margin-top: 1px;
        }
      }
    }

    .field-editor {
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 8px;
      padding: 10px 12px;
      background: var(--el-fill-color-light);
      .editor-title {
        font-weight: 700;
        font-size: 13px;
        margin-bottom: 2px;
      }
      .editor-hint {
        font-size: 11px;
        color: var(--el-text-color-secondary);
        margin-bottom: 8px;
      }
      .editor-options {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .mode-config {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        padding-top: 4px;
        &.range-inputs .range-sep {
          font-size: 18px;
          font-weight: 700;
          margin: 0 4px;
        }
      }

      .value-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        max-height: 100px;
        overflow-y: auto;
        padding: 2px 0;
        .chip {
          padding: 3px 8px;
          border: 1px solid var(--el-border-color);
          border-radius: 16px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          background: var(--el-bg-color-overlay);
          transition: all 0.12s;
          user-select: none;
          &:hover {
            border-color: var(--el-color-primary);
          }
          &.selected {
            background: var(--el-color-primary);
            border-color: var(--el-color-primary);
            color: #fff;
          }
        }
      }
    }
  }
</style>
