export type CronMode = 'auto' | 'linux' | 'seconds'

type ResolvedCronMode = Exclude<CronMode, 'auto'>

type CronFieldName = 'second' | 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek'

type CronFieldConfig = {
  name: CronFieldName
  min: number
  max: number
  aliases?: Record<string, number>
}

type CronField = {
  values: Set<number>
  wildcard: boolean
}

type CronSchedule = {
  mode: ResolvedCronMode
  second: CronField
  minute: CronField
  hour: CronField
  dayOfMonth: CronField
  month: CronField
  dayOfWeek: CronField
}

export type CronParseResult = {
  detectedMode: ResolvedCronMode
  fieldHint: string
  runs: Date[]
}

const monthAliases: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
}

const dayAliases: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6
}

const fieldHints: Record<ResolvedCronMode, string> = {
  linux: 'minute hour day-of-month month day-of-week',
  seconds: 'second minute hour day-of-month month day-of-week'
}

const fieldConfigMap: Record<CronFieldName, CronFieldConfig> = {
  second: { name: 'second', min: 0, max: 59 },
  minute: { name: 'minute', min: 0, max: 59 },
  hour: { name: 'hour', min: 0, max: 23 },
  dayOfMonth: { name: 'dayOfMonth', min: 1, max: 31 },
  month: { name: 'month', min: 1, max: 12, aliases: monthAliases },
  dayOfWeek: { name: 'dayOfWeek', min: 0, max: 7, aliases: dayAliases }
}

const modeFields: Record<ResolvedCronMode, CronFieldName[]> = {
  linux: ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'],
  seconds: ['second', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek']
}

const normalizeValue = (value: string, config: CronFieldConfig) => {
  const lowerValue = value.toLowerCase()
  const mappedValue = config.aliases?.[lowerValue] ?? Number(value)
  if (!Number.isInteger(mappedValue)) {
    throw new Error(`${value} is not valid for ${config.name}`)
  }
  if (config.name === 'dayOfWeek' && mappedValue === 7) {
    return 0
  }
  if (mappedValue < config.min || mappedValue > config.max) {
    throw new Error(`${value} is outside ${config.name} range`)
  }
  return mappedValue
}

const addRange = (
  values: Set<number>,
  start: number,
  end: number,
  step: number,
  config: CronFieldConfig
) => {
  if (step < 1) {
    throw new Error(`${config.name} step must be greater than 0`)
  }
  if (start > end) {
    throw new Error(`${config.name} range start must be less than end`)
  }
  for (let value = start; value <= end; value += step) {
    values.add(config.name === 'dayOfWeek' && value === 7 ? 0 : value)
  }
}

const parseField = (field: string, config: CronFieldConfig): CronField => {
  const values = new Set<number>()
  const parts = field.split(',')
  let wildcard = false
  for (const part of parts) {
    if (!part) {
      throw new Error(`${config.name} contains an empty value`)
    }
    const [rangePart, stepPart] = part.split('/')
    if (part.split('/').length > 2) {
      throw new Error(`${config.name} contains an invalid step`)
    }
    const step = stepPart ? Number(stepPart) : 1
    if (!Number.isInteger(step)) {
      throw new Error(`${config.name} step must be a number`)
    }
    if (rangePart === '*') {
      wildcard = true
      addRange(values, config.min, config.max, step, config)
      continue
    }
    const rangeValues = rangePart.split('-')
    if (rangeValues.length === 1) {
      values.add(normalizeValue(rangeValues[0], config))
      continue
    }
    if (rangeValues.length === 2) {
      addRange(
        values,
        normalizeValue(rangeValues[0], config),
        normalizeValue(rangeValues[1], config),
        step,
        config
      )
      continue
    }
    throw new Error(`${config.name} contains an invalid range`)
  }
  return {
    values,
    wildcard
  }
}

const resolveMode = (fields: string[], mode: CronMode): ResolvedCronMode => {
  if (mode === 'linux') {
    if (fields.length !== 5) {
      throw new Error('Linux crontab mode requires 5 fields')
    }
    return 'linux'
  }
  if (mode === 'seconds') {
    if (fields.length !== 6) {
      throw new Error('Seconds mode requires 6 fields')
    }
    return 'seconds'
  }
  if (fields.length === 5) {
    return 'linux'
  }
  if (fields.length === 6) {
    return 'seconds'
  }
  throw new Error('Cron expression must contain 5 or 6 fields')
}

const parseSchedule = (expression: string, mode: CronMode) => {
  const fields = expression.trim().split(/\s+/)
  const resolvedMode = resolveMode(fields, mode)
  const fieldNames = modeFields[resolvedMode]
  const parsedFields = fieldNames.reduce(
    (schedule, fieldName, index) => {
      schedule[fieldName] = parseField(fields[index], fieldConfigMap[fieldName])
      return schedule
    },
    {} as Partial<Record<CronFieldName, CronField>>
  )
  return {
    mode: resolvedMode,
    second: parsedFields.second ?? { values: new Set([0]), wildcard: false },
    minute: parsedFields.minute!,
    hour: parsedFields.hour!,
    dayOfMonth: parsedFields.dayOfMonth!,
    month: parsedFields.month!,
    dayOfWeek: parsedFields.dayOfWeek!
  } satisfies CronSchedule
}

const matchDay = (date: Date, schedule: CronSchedule) => {
  const dayOfMonthMatch = schedule.dayOfMonth.values.has(date.getDate())
  const dayOfWeekMatch = schedule.dayOfWeek.values.has(date.getDay())
  if (schedule.dayOfMonth.wildcard && schedule.dayOfWeek.wildcard) {
    return true
  }
  if (schedule.dayOfMonth.wildcard) {
    return dayOfWeekMatch
  }
  if (schedule.dayOfWeek.wildcard) {
    return dayOfMonthMatch
  }
  return dayOfMonthMatch || dayOfWeekMatch
}

const isMatch = (date: Date, schedule: CronSchedule) => {
  return (
    schedule.second.values.has(date.getSeconds()) &&
    schedule.minute.values.has(date.getMinutes()) &&
    schedule.hour.values.has(date.getHours()) &&
    matchDay(date, schedule) &&
    schedule.month.values.has(date.getMonth() + 1)
  )
}

const shouldScanBySecond = (schedule: CronSchedule) => {
  return (
    schedule.mode !== 'linux' &&
    !(schedule.second.values.size === 1 && schedule.second.values.has(0))
  )
}

export const getNextRuns = (
  expression: string,
  count: number,
  mode: CronMode = 'auto'
): CronParseResult => {
  const schedule = parseSchedule(expression, mode)
  const runs: Date[] = []
  const cursor = new Date()
  cursor.setMilliseconds(0)
  const scanBySecond = shouldScanBySecond(schedule)
  if (scanBySecond) {
    cursor.setSeconds(cursor.getSeconds() + 1)
  } else {
    cursor.setSeconds(0)
    cursor.setMinutes(cursor.getMinutes() + 1)
  }
  const limit = scanBySecond ? 366 * 24 * 60 * 60 : 366 * 24 * 60
  for (let index = 0; index < limit && runs.length < count; index += 1) {
    if (isMatch(cursor, schedule)) {
      runs.push(new Date(cursor))
    }
    if (scanBySecond) {
      cursor.setSeconds(cursor.getSeconds() + 1)
    } else {
      cursor.setMinutes(cursor.getMinutes() + 1)
    }
  }
  if (runs.length === 0) {
    throw new Error('No matching run time found in the next year')
  }
  return {
    detectedMode: schedule.mode,
    fieldHint: fieldHints[schedule.mode],
    runs
  }
}
