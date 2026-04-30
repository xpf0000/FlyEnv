import { reactive } from 'vue'
import { getNextRuns, type CronMode } from './cron-parser.service'

type CronExample = {
  label: string
  expression: string
}

type GenerateMode = 'everyMinute' | 'everyNMinutes' | 'hourly' | 'daily' | 'weekly' | 'monthly'

type GenerateModeOption = {
  label: string
  value: GenerateMode
}

const examples: CronExample[] = [
  { label: 'Every minute', expression: '* * * * *' },
  { label: 'Every 5 minutes', expression: '*/5 * * * *' },
  { label: 'Every day at midnight', expression: '0 0 * * *' },
  { label: 'Weekdays at 9:00', expression: '0 9 * * 1-5' },
  { label: 'First day of month', expression: '0 0 1 * *' }
]

const generateModes: GenerateModeOption[] = [
  { label: 'Every minute', value: 'everyMinute' },
  { label: 'Every N minutes', value: 'everyNMinutes' },
  { label: 'Hourly', value: 'hourly' },
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' }
]

const cronModes: { label: string; value: CronMode }[] = [
  { label: 'Auto', value: 'auto' },
  { label: 'Linux 5 fields', value: 'linux' },
  { label: 'Seconds 6 fields', value: 'seconds' }
]

const modeFieldHints: Record<CronMode, string> = {
  auto: 'Auto-detects 5 or 6 fields',
  linux: 'minute hour day-of-month month day-of-week',
  seconds: 'second minute hour day-of-month month day-of-week'
}

const padTime = (value: number) => value.toString().padStart(2, '0')

const buildExpression = (
  mode: CronMode,
  generateMode: GenerateMode,
  intervalMinutes: number,
  minute: number,
  hour: number,
  dayOfWeek: number,
  dayOfMonth: number
) => {
  const outputMode = mode === 'auto' ? 'linux' : mode
  const withPrefix = (expression: string) => {
    if (outputMode === 'linux') {
      return expression
    }
    return `0 ${expression}`
  }
  if (generateMode === 'everyMinute') {
    return outputMode === 'linux' ? '* * * * *' : '0 * * * * *'
  }
  if (generateMode === 'everyNMinutes') {
    return withPrefix(`*/${intervalMinutes} * * * *`)
  }
  if (generateMode === 'hourly') {
    return withPrefix(`${minute} * * * *`)
  }
  if (generateMode === 'daily') {
    return withPrefix(`${minute} ${hour} * * *`)
  }
  if (generateMode === 'weekly') {
    return withPrefix(`${minute} ${hour} * * ${dayOfWeek}`)
  }
  return withPrefix(`${minute} ${hour} ${dayOfMonth} * *`)
}

const store = reactive({
  expression: '*/5 * * * *',
  cronMode: 'auto' as CronMode,
  count: 10,
  error: '',
  detectedMode: '',
  fieldHint: '',
  results: [] as string[],
  examples,
  cronModes,
  modeFieldHints,
  generateModes,
  generateMode: 'everyNMinutes' as GenerateMode,
  intervalMinutes: 5,
  minute: 0,
  hour: 9,
  dayOfWeek: 1,
  dayOfMonth: 1,
  generatedDescription: '',
  parse() {
    this.error = ''
    this.results = []
    try {
      const parsed = getNextRuns(this.expression, this.count, this.cronMode)
      this.detectedMode = parsed.detectedMode
      this.fieldHint = parsed.fieldHint
      this.results = parsed.runs.map((date) => date.toLocaleString())
    } catch (error: any) {
      this.error = error?.message ?? 'Invalid cron expression'
      this.detectedMode = ''
      this.fieldHint = this.modeFieldHints[this.cronMode]
    }
  },
  useExample(expression: string) {
    this.expression = expression
    this.parse()
  },
  generate() {
    const minute = Math.max(0, Math.min(59, Number(this.minute) || 0))
    const hour = Math.max(0, Math.min(23, Number(this.hour) || 0))
    const intervalMinutes = Math.max(1, Math.min(59, Number(this.intervalMinutes) || 1))
    const dayOfWeek = Math.max(0, Math.min(6, Number(this.dayOfWeek) || 0))
    const dayOfMonth = Math.max(1, Math.min(31, Number(this.dayOfMonth) || 1))
    this.minute = minute
    this.hour = hour
    this.intervalMinutes = intervalMinutes
    this.dayOfWeek = dayOfWeek
    this.dayOfMonth = dayOfMonth
    this.expression = buildExpression(
      this.cronMode,
      this.generateMode,
      intervalMinutes,
      minute,
      hour,
      dayOfWeek,
      dayOfMonth
    )
    if (this.generateMode === 'everyMinute') {
      this.generatedDescription = 'Runs every minute'
    } else if (this.generateMode === 'everyNMinutes') {
      this.generatedDescription = `Runs every ${intervalMinutes} minutes`
    } else if (this.generateMode === 'hourly') {
      this.generatedDescription = `Runs hourly at minute ${padTime(minute)}`
    } else if (this.generateMode === 'daily') {
      this.generatedDescription = `Runs daily at ${padTime(hour)}:${padTime(minute)}`
    } else if (this.generateMode === 'weekly') {
      this.generatedDescription = `Runs weekly on day ${dayOfWeek} at ${padTime(hour)}:${padTime(minute)}`
    } else {
      this.generatedDescription = `Runs monthly on day ${dayOfMonth} at ${padTime(hour)}:${padTime(minute)}`
    }
    this.parse()
  }
})

store.generate()

export default store
