<template>
  <el-dialog
    v-model="visible"
    :title="I18nT('cron.helper')"
    width="600px"
    class="schedule-helper-dialog el-dialog-content-flex-1 h-[75%] dark:bg-[#1d2033]"
    @close="$emit('close')"
  >
    <el-scrollbar>
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
            <div class="preset-name">{{ I18nT(preset.labelKey) }}</div>
            <div class="preset-expr">{{ preset.value }}</div>
          </div>
        </div>

        <!-- Field editor -->
        <div class="section-title">{{ I18nT('cron.custom') }}</div>
        <div class="field-tabs">
          <div
            v-for="(_field, i) in fields"
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
                <el-radio value="any">{{ I18nT('cron.modeAny') }}</el-radio>
                <el-radio value="every">{{ I18nT('cron.modeEvery') }}</el-radio>
                <el-radio value="specific">{{ I18nT('cron.modeSpecific') }}</el-radio>
                <el-radio value="range">{{ I18nT('cron.modeRange') }}</el-radio>
              </el-radio-group>
            </div>

            <div v-if="fields[activeField].mode === 'every'" class="mode-config">
              <el-input-number
                v-model="fields[activeField].everyN"
                :min="1"
                :max="fields[activeField].max"
                controls-position="right"
              />
              <span class="ml-2 text-sm text-gray-500">{{
                I18nT(fields[activeField].unitKey)
              }}</span>
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
              {{ I18nT(preset.labelKey) }}
            </el-button>
          </div>
        </div>

        <el-divider class="hidden-old" style="display: none" />

        <div class="hidden-old" style="display: none">
          <h4>{{ I18nT('cron.custom') }}</h4>
        </div>
      </div>
    </el-scrollbar>

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
  import { validatePortableCronExpression } from '@shared/CronExpression'
  import { MessageError } from '@/util/Element'

  const emit = defineEmits<{
    select: [schedule: string]
    close: []
  }>()

  const visible = ref(true)
  const activeField = ref(0)
  type I18nKey = Parameters<typeof I18nT>[0]
  const fieldLabels = computed(() => [
    I18nT('cron.fieldMinute'),
    I18nT('cron.fieldHour'),
    I18nT('cron.fieldDay'),
    I18nT('cron.fieldMonth'),
    I18nT('cron.fieldWeekday')
  ])

  interface FieldDef {
    mode: 'any' | 'every' | 'specific' | 'range'
    min: number
    max: number
    everyN: number
    specific: number[]
    rangeFrom: number
    rangeTo: number
    hint: string
    unitKey: I18nKey
    options: { label: string; value: number }[]
  }

  const makeOptions = (from: number, to: number, labels?: string[]) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      value: from + i,
      label: labels ? labels[i] : String(from + i)
    }))

  const monthLabels = [
    I18nT('cron.monthJan'),
    I18nT('cron.monthFeb'),
    I18nT('cron.monthMar'),
    I18nT('cron.monthApr'),
    I18nT('cron.monthMay'),
    I18nT('cron.monthJun'),
    I18nT('cron.monthJul'),
    I18nT('cron.monthAug'),
    I18nT('cron.monthSep'),
    I18nT('cron.monthOct'),
    I18nT('cron.monthNov'),
    I18nT('cron.monthDec')
  ]
  const weekLabels = [
    I18nT('cron.weekSun'),
    I18nT('cron.weekMon'),
    I18nT('cron.weekTue'),
    I18nT('cron.weekWed'),
    I18nT('cron.weekThu'),
    I18nT('cron.weekFri'),
    I18nT('cron.weekSat')
  ]

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
      unitKey: 'cron.unitMinutes',
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
      unitKey: 'cron.unitHours',
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
      unitKey: 'cron.unitDays',
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
      unitKey: 'cron.unitMonths',
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
      hint: I18nT('cron.hintWeekdayRange'),
      unitKey: 'cron.unitWeekdays',
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
    if (generatedSchedule.value === '* * * * *') return I18nT('cron.descEveryMinute')
    if (generatedSchedule.value === '0 * * * *') return I18nT('cron.descEveryHour')
    if (generatedSchedule.value === '0 0 * * *') return I18nT('cron.descDailyMidnight')
    if (generatedSchedule.value === '0 0 * * 0') return I18nT('cron.descEverySundayMidnight')
    if (generatedSchedule.value === '0 0 1 * *') return I18nT('cron.descMonthly1st')
    if (generatedSchedule.value === '0 9 * * 1-5') return I18nT('cron.descWeekdays9')
    const [min, hr] = partValues.value
    const parts: string[] = []
    if (min.startsWith('*/')) parts.push(I18nT('cron.descEveryNMinutes', { n: min.slice(2) }))
    else if (min !== '*') parts.push(I18nT('cron.descAtMinute', { n: min }))
    if (hr.startsWith('*/')) parts.push(I18nT('cron.descEveryNHours', { n: hr.slice(2) }))
    else if (hr !== '*') parts.push(I18nT('cron.descAtHour', { n: hr }))
    return parts.join(', ')
  })

  interface Preset {
    labelKey: I18nKey
    icon: string
    value: string
  }

  const presets: Preset[] = [
    { labelKey: 'cron.presetEveryMinute', icon: '1m', value: '* * * * *' },
    { labelKey: 'cron.presetEveryHour', icon: '1h', value: '0 * * * *' },
    { labelKey: 'cron.presetEvery2Hours', icon: '2h', value: '0 */2 * * *' },
    { labelKey: 'cron.presetDailyMidnight', icon: '0:00', value: '0 0 * * *' },
    { labelKey: 'cron.presetDaily6', icon: '6:00', value: '0 6 * * *' },
    { labelKey: 'cron.presetDaily12', icon: '12:00', value: '0 12 * * *' },
    { labelKey: 'cron.presetDaily18', icon: '18:00', value: '0 18 * * *' },
    { labelKey: 'cron.presetWeekdays9', icon: '9-5', value: '0 9 * * 1-5' },
    { labelKey: 'cron.presetEverySunday', icon: '7d', value: '0 0 * * 0' },
    { labelKey: 'cron.presetMonthly1st', icon: '1st', value: '0 0 1 * *' },
    { labelKey: 'cron.presetEvery5Min', icon: '5m', value: '*/5 * * * *' },
    { labelKey: 'cron.presetEvery15Min', icon: '15m', value: '*/15 * * * *' }
  ]

  // kept for compatibility with legacy slot (hidden)
  const presetsLegacy = presets.map((p) => ({ labelKey: p.labelKey, value: p.value }))

  const toggleSpecific = (v: number) => {
    const f = fields.value[activeField.value]
    const idx = f.specific.indexOf(v)
    if (idx === -1) f.specific.push(v)
    else f.specific.splice(idx, 1)
  }

  const applyPreset = (preset: Preset) => {
    const result = validatePortableCronExpression(preset.value)
    if (!result.valid) {
      MessageError(`${I18nT('cron.scheduleInvalid')}: ${result.error}`)
      return
    }
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

  const selectPreset = (preset: { labelKey: I18nKey; value: string }) => {
    emit('select', preset.value)
    visible.value = false
  }

  const applySchedule = () => {
    const result = validatePortableCronExpression(generatedSchedule.value)
    if (!result.valid) {
      MessageError(`${I18nT('cron.scheduleInvalid')}: ${result.error}`)
      return
    }
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
