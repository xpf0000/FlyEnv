type CronFieldKind = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek'

type CronSegment =
  | {
      kind: 'range'
      start: number
      end: number
      step: number
    }
  | {
      kind: 'lastDayOfMonth'
    }
  | {
      kind: 'lastWeekdayOfMonth'
    }
  | {
      kind: 'nearestWeekday'
      day: number
    }
  | {
      kind: 'lastDayOfWeek'
      weekday: number
    }
  | {
      kind: 'nthDayOfWeek'
      weekday: number
      nth: number
    }

interface CronFieldConfig {
  kind: CronFieldKind
  min: number
  max: number
  names?: Record<string, number>
  allowQuestion?: boolean
}

interface ParsedCronField {
  raw: string
  kind: CronFieldKind
  wildcard: boolean
  restricted: boolean
  segments: CronSegment[]
}

export interface ParsedCronExpression {
  raw: string
  parts: string[]
  minute: ParsedCronField
  hour: ParsedCronField
  dayOfMonth: ParsedCronField
  month: ParsedCronField
  dayOfWeek: ParsedCronField
}

export interface CronValidationResult {
  valid: boolean
  error?: string
  parsed?: ParsedCronExpression
}

export type PortableCronSchedule =
  | {
      type: 'minute'
      interval: number
    }
  | {
      type: 'hourly'
      minute: number
      interval: number
    }
  | {
      type: 'daily'
      minute: number
      hour: number
    }
  | {
      type: 'weekly'
      minute: number
      hour: number
      weekdays: number[]
    }
  | {
      type: 'monthly'
      minute: number
      hour: number
      day: number
      months: number[]
    }

const MONTH_NAMES: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12
}

const WEEKDAY_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6
}

const FIELD_CONFIGS: CronFieldConfig[] = [
  { kind: 'minute', min: 0, max: 59 },
  { kind: 'hour', min: 0, max: 23 },
  { kind: 'dayOfMonth', min: 1, max: 31, allowQuestion: true },
  { kind: 'month', min: 1, max: 12, names: MONTH_NAMES },
  { kind: 'dayOfWeek', min: 0, max: 7, names: WEEKDAY_NAMES, allowQuestion: true }
]

const isIntegerText = (value: string): boolean => /^\d+$/.test(value)

const parseInteger = (value: string, label: string): number => {
  if (!isIntegerText(value)) {
    throw new Error(`${label} must be a number`)
  }
  return Number(value)
}

const normalizeNames = (
  value: string,
  kind: CronFieldKind,
  names?: Record<string, number>
): string => {
  let normalized = value.trim().toUpperCase()
  if (!names) {
    if (kind === 'dayOfMonth') {
      if (/[^0-9LW*,?/-]/.test(normalized)) {
        throw new Error(`Unsupported token "${value}"`)
      }
      return normalized
    }
    if (/[A-Z]/.test(normalized)) {
      throw new Error(`Unsupported token "${value}"`)
    }
    return normalized
  }

  normalized = normalized.replace(/[A-Z]{3}/g, (token) => {
    const replacement = names[token]
    if (replacement === undefined) {
      throw new Error(`Unsupported token "${token}"`)
    }
    return `${replacement}`
  })

  if (kind === 'dayOfWeek') {
    if (/[^0-9L#*,?/-]/.test(normalized)) {
      throw new Error(`Unsupported token "${value}"`)
    }
    return normalized
  }

  if (/[A-Z]/.test(normalized)) {
    throw new Error(`Unsupported token "${value}"`)
  }

  return normalized
}

const validateRangeValue = (value: number, config: CronFieldConfig, segment: string) => {
  if (value < config.min || value > config.max) {
    throw new Error(`${config.kind} value "${segment}" is out of range`)
  }
}

const parseRangeSegment = (segment: string, config: CronFieldConfig): CronSegment => {
  const stepParts = segment.split('/')
  if (stepParts.length > 2) {
    throw new Error(`Invalid step syntax "${segment}"`)
  }

  const base = stepParts[0]
  if (!base) {
    throw new Error(`Invalid empty range "${segment}"`)
  }

  const step = stepParts.length === 2 ? parseInteger(stepParts[1], `${config.kind} step`) : 1
  if (step <= 0) {
    throw new Error(`${config.kind} step must be greater than 0`)
  }

  let start = config.min
  let end = config.max
  if (base === '*') {
    start = config.min
    end = config.max
  } else if (base.includes('-')) {
    const rangeParts = base.split('-')
    if (rangeParts.length !== 2 || !rangeParts[0] || !rangeParts[1]) {
      throw new Error(`Invalid range "${segment}"`)
    }
    start = parseInteger(rangeParts[0], `${config.kind} range start`)
    end = parseInteger(rangeParts[1], `${config.kind} range end`)
    validateRangeValue(start, config, rangeParts[0])
    validateRangeValue(end, config, rangeParts[1])
    if (start > end) {
      throw new Error(`${config.kind} range start must not exceed end`)
    }
  } else {
    start = parseInteger(base, config.kind)
    end = start
    validateRangeValue(start, config, base)
  }

  return {
    kind: 'range',
    start,
    end,
    step
  }
}

const parseDayOfMonthSpecial = (segment: string): CronSegment | undefined => {
  if (segment === 'L') {
    return { kind: 'lastDayOfMonth' }
  }

  if (segment === 'LW') {
    return { kind: 'lastWeekdayOfMonth' }
  }

  const weekdayMatch = segment.match(/^(\d+)W$/)
  if (weekdayMatch) {
    const day = parseInteger(weekdayMatch[1], 'nearest weekday day')
    if (day < 1 || day > 31) {
      throw new Error('nearest weekday day is out of range')
    }
    return {
      kind: 'nearestWeekday',
      day
    }
  }

  return undefined
}

const normalizeWeekday = (value: number): number => (value === 7 ? 0 : value)

const parseDayOfWeekSpecial = (segment: string): CronSegment | undefined => {
  const lastMatch = segment.match(/^(\d+)L$/)
  if (lastMatch) {
    const weekday = parseInteger(lastMatch[1], 'last weekday')
    if (weekday < 0 || weekday > 7) {
      throw new Error('last weekday is out of range')
    }
    return {
      kind: 'lastDayOfWeek',
      weekday: normalizeWeekday(weekday)
    }
  }

  const nthMatch = segment.match(/^(\d+)#([1-5])$/)
  if (nthMatch) {
    const weekday = parseInteger(nthMatch[1], 'nth weekday')
    const nth = parseInteger(nthMatch[2], 'weekday occurrence')
    if (weekday < 0 || weekday > 7) {
      throw new Error('nth weekday is out of range')
    }
    return {
      kind: 'nthDayOfWeek',
      weekday: normalizeWeekday(weekday),
      nth
    }
  }

  return undefined
}

const parseCronField = (field: string, config: CronFieldConfig): ParsedCronField => {
  const raw = field.trim()
  if (!raw) {
    throw new Error(`${config.kind} field is empty`)
  }

  const normalized = normalizeNames(raw, config.kind, config.names)
  if (normalized === '*' || (config.allowQuestion && normalized === '?')) {
    return {
      raw,
      kind: config.kind,
      wildcard: true,
      restricted: false,
      segments: [{ kind: 'range', start: config.min, end: config.max, step: 1 }]
    }
  }

  if (normalized.includes('?')) {
    throw new Error(`? is only allowed as the whole day field`)
  }

  const parts = normalized.split(',')
  if (parts.some((part) => !part.trim())) {
    throw new Error(`Invalid list syntax in ${config.kind}`)
  }

  const segments = parts.map((part) => {
    const segment = part.trim()
    if (config.kind === 'dayOfMonth') {
      const special = parseDayOfMonthSpecial(segment)
      if (special) {
        return special
      }
    }
    if (config.kind === 'dayOfWeek') {
      const special = parseDayOfWeekSpecial(segment)
      if (special) {
        return special
      }
    }
    return parseRangeSegment(segment, config)
  })

  return {
    raw,
    kind: config.kind,
    wildcard: false,
    restricted: true,
    segments
  }
}

export const parseCronExpression = (schedule: string): ParsedCronExpression => {
  const raw = schedule.trim()
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length !== 5) {
    throw new Error('Cron expression must contain 5 fields')
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts.map((part, index) =>
    parseCronField(part, FIELD_CONFIGS[index])
  )

  return {
    raw,
    parts,
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek
  }
}

export const validateCronExpression = (schedule: string): CronValidationResult => {
  try {
    return {
      valid: true,
      parsed: parseCronExpression(schedule)
    }
  } catch (e: any) {
    return {
      valid: false,
      error: e?.message || `${e}`
    }
  }
}

export const assertCronExpression = (schedule: string): ParsedCronExpression => {
  return parseCronExpression(schedule)
}

const MINUTE_INTERVALS = new Set([1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30])
const HOUR_INTERVALS = new Set([1, 2, 3, 4, 6, 8, 12])

const parseSinglePortableNumber = (
  value: string,
  min: number,
  max: number,
  label: string
): number | undefined => {
  if (!isIntegerText(value)) {
    return undefined
  }
  const parsed = Number(value)
  if (parsed < min || parsed > max) {
    throw new Error(`${label} value "${value}" is out of range`)
  }
  return parsed
}

const parsePortableStep = (
  value: string,
  allowed: Set<number>,
  label: string
): number | undefined => {
  if (!value.startsWith('*/')) {
    return undefined
  }
  const step = parseInteger(value.slice(2), `${label} interval`)
  if (!allowed.has(step)) {
    throw new Error(
      `${label} interval "${step}" cannot be represented consistently on all platforms`
    )
  }
  return step
}

const parsePortableSet = (
  value: string,
  min: number,
  max: number,
  label: string,
  normalize: (input: number) => number = (input) => input
): number[] | undefined => {
  if (value === '*') {
    return undefined
  }
  if (value.includes('/') || value.includes('?')) {
    throw new Error(`${label} only supports numbers, ranges, and comma lists`)
  }

  const result: number[] = []
  for (const segment of value.split(',')) {
    if (!segment) {
      throw new Error(`Invalid ${label} list syntax`)
    }

    if (segment.includes('-')) {
      const range = segment.split('-')
      if (range.length !== 2) {
        throw new Error(`Invalid ${label} range syntax`)
      }
      const start = parseSinglePortableNumber(range[0], min, max, label)
      const end = parseSinglePortableNumber(range[1], min, max, label)
      if (start === undefined || end === undefined || start > end) {
        throw new Error(`Invalid ${label} range syntax`)
      }
      for (let current = start; current <= end; current++) {
        result.push(normalize(current))
      }
      continue
    }

    const exact = parseSinglePortableNumber(segment, min, max, label)
    if (exact === undefined) {
      throw new Error(`Invalid ${label} value "${segment}"`)
    }
    result.push(normalize(exact))
  }

  return [...new Set(result)].sort((a, b) => a - b)
}

const assertNumericCronOnly = (schedule: string) => {
  if (/[A-Za-z?#]/.test(schedule)) {
    throw new Error(
      'Only numeric standard cron syntax is supported across macOS, Linux, and Windows'
    )
  }
}

const normalizePortableParts = (schedule: string): string[] => {
  assertNumericCronOnly(schedule)
  const parts = schedule.trim().split(/\s+/).filter(Boolean)
  if (parts.length !== 5) {
    throw new Error('Cron expression must contain 5 fields')
  }
  parseCronExpression(schedule)
  return parts
}

export const getPortableCronSchedule = (schedule: string): PortableCronSchedule => {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = normalizePortableParts(schedule)
  const minuteStep = parsePortableStep(minute, MINUTE_INTERVALS, 'minute')
  if (minuteStep && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return {
      type: 'minute',
      interval: minuteStep
    }
  }
  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return {
      type: 'minute',
      interval: 1
    }
  }

  const minuteValue = parseSinglePortableNumber(minute, 0, 59, 'minute')
  if (minuteValue === undefined) {
    throw new Error('This cron expression cannot be represented consistently on all platforms')
  }

  const hourStep = parsePortableStep(hour, HOUR_INTERVALS, 'hour')
  if (hourStep && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return {
      type: 'hourly',
      minute: minuteValue,
      interval: hourStep
    }
  }
  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return {
      type: 'hourly',
      minute: minuteValue,
      interval: 1
    }
  }

  const hourValue = parseSinglePortableNumber(hour, 0, 23, 'hour')
  if (hourValue === undefined) {
    throw new Error('This cron expression cannot be represented consistently on all platforms')
  }

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return {
      type: 'daily',
      minute: minuteValue,
      hour: hourValue
    }
  }

  if (dayOfMonth === '*' && month === '*') {
    const weekdays = parsePortableSet(dayOfWeek, 0, 7, 'dayOfWeek', normalizeWeekday)
    if (weekdays?.length) {
      return {
        type: 'weekly',
        minute: minuteValue,
        hour: hourValue,
        weekdays
      }
    }
  }

  if (dayOfWeek === '*') {
    const day = parseSinglePortableNumber(dayOfMonth, 1, 31, 'dayOfMonth')
    const months = parsePortableSet(month, 1, 12, 'month') ?? [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
    ]
    if (months.length !== 1 && months.length !== 12) {
      throw new Error('month must be "*" or a single month for cross-platform monthly schedules')
    }
    if (day !== undefined && months.length) {
      return {
        type: 'monthly',
        minute: minuteValue,
        hour: hourValue,
        day,
        months
      }
    }
  }

  throw new Error('This cron expression cannot be represented consistently on all platforms')
}

export const assertPortableCronExpression = (schedule: string): PortableCronSchedule => {
  return getPortableCronSchedule(schedule)
}

export const validatePortableCronExpression = (schedule: string): CronValidationResult => {
  try {
    getPortableCronSchedule(schedule)
    return {
      valid: true,
      parsed: parseCronExpression(schedule)
    }
  } catch (e: any) {
    return {
      valid: false,
      error: e?.message || `${e}`
    }
  }
}

const getLastDayOfMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate()
}

const getLastWeekdayOfMonth = (year: number, month: number): number => {
  const lastDay = getLastDayOfMonth(year, month)
  for (let day = lastDay; day >= lastDay - 6; day--) {
    const weekday = new Date(year, month - 1, day).getDay()
    if (weekday >= 1 && weekday <= 5) {
      return day
    }
  }
  return lastDay
}

const getNearestWeekday = (year: number, month: number, day: number): number | undefined => {
  const lastDay = getLastDayOfMonth(year, month)
  if (day < 1 || day > lastDay) {
    return undefined
  }

  const weekday = new Date(year, month - 1, day).getDay()
  if (weekday >= 1 && weekday <= 5) {
    return day
  }
  if (weekday === 6) {
    return day === 1 ? 3 : day - 1
  }
  return day === lastDay ? day - 2 : day + 1
}

const matchRangeSegment = (
  segment: Extract<CronSegment, { kind: 'range' }>,
  value: number,
  fieldKind: CronFieldKind
): boolean => {
  for (let current = segment.start; current <= segment.end; current += segment.step) {
    const normalized = fieldKind === 'dayOfWeek' ? normalizeWeekday(current) : current
    if (normalized === value) {
      return true
    }
  }
  return false
}

const matchCronField = (field: ParsedCronField, date: Date): boolean => {
  if (field.wildcard) {
    return true
  }

  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const dayOfMonth = date.getDate()
  const dayOfWeek = date.getDay()
  const valueMap: Record<CronFieldKind, number> = {
    minute: date.getMinutes(),
    hour: date.getHours(),
    dayOfMonth,
    month,
    dayOfWeek
  }
  const value = valueMap[field.kind]

  return field.segments.some((segment) => {
    switch (segment.kind) {
      case 'range':
        return matchRangeSegment(segment, value, field.kind)
      case 'lastDayOfMonth':
        return dayOfMonth === getLastDayOfMonth(year, month)
      case 'lastWeekdayOfMonth':
        return dayOfMonth === getLastWeekdayOfMonth(year, month)
      case 'nearestWeekday':
        return dayOfMonth === getNearestWeekday(year, month, segment.day)
      case 'lastDayOfWeek':
        return dayOfWeek === segment.weekday && dayOfMonth + 7 > getLastDayOfMonth(year, month)
      case 'nthDayOfWeek':
        return dayOfWeek === segment.weekday && Math.floor((dayOfMonth - 1) / 7) + 1 === segment.nth
      default:
        return false
    }
  })
}

export const matchParsedCronExpression = (parsed: ParsedCronExpression, date: Date): boolean => {
  const minuteOk = matchCronField(parsed.minute, date)
  const hourOk = matchCronField(parsed.hour, date)
  const monthOk = matchCronField(parsed.month, date)
  const dayOfMonthOk = matchCronField(parsed.dayOfMonth, date)
  const dayOfWeekOk = matchCronField(parsed.dayOfWeek, date)
  const dayOk =
    parsed.dayOfMonth.restricted && parsed.dayOfWeek.restricted
      ? dayOfMonthOk || dayOfWeekOk
      : dayOfMonthOk && dayOfWeekOk

  return minuteOk && hourOk && monthOk && dayOk
}

export const matchCronExpression = (schedule: string, date: Date): boolean => {
  return matchParsedCronExpression(parseCronExpression(schedule), date)
}

export const computeNextCronRun = (schedule: string, fromDate: Date): number => {
  const parsed = parseCronExpression(schedule)
  const probe = new Date(fromDate.getTime())
  probe.setSeconds(0, 0)
  probe.setMinutes(probe.getMinutes() + 1)

  const maxChecks = 60 * 24 * 366 * 5
  for (let i = 0; i < maxChecks; i++) {
    if (matchParsedCronExpression(parsed, probe)) {
      return probe.getTime()
    }
    probe.setMinutes(probe.getMinutes() + 1)
  }

  return 0
}
