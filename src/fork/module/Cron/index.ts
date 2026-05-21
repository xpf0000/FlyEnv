import { Base } from '../Base'
import type { CronJob, CronRunRecord } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { uuid, readFile, writeFile, mkdirp, appendFile, chmod, remove } from '../../Fn'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { execPromise } from '../../Fn'
import {
  assertPortableCronExpression,
  computeNextCronRun,
  getPortableCronSchedule,
  type PortableCronSchedule
} from '@shared/CronExpression'

type CronStorageData = Record<string, CronJob[]>

const GLOBAL_HOST_ID = 0
const RUN_HISTORY_LIMIT = 50

export class Cron extends Base {
  private cronDataPath: string
  private cronRoot: string
  private initStarted = false

  constructor() {
    super()
    this.type = 'cron'
    this.cronRoot = this.cronBaseDir()
    this.cronDataPath = join(this.cronRoot, 'cron-jobs.json')
  }

  init() {
    if (this.initStarted) {
      return
    }
    this.initStarted = true
    this.syncSystemCronJobs().catch((e) => {
      console.error('[Cron] sync system cron jobs failed:', e)
    })
  }

  private homePath(): string {
    return homedir() || process.env.HOME || process.env.USERPROFILE || ''
  }

  private cronBaseDir(): string {
    return join(global.Server.BaseDir!, 'cron')
  }

  private storageKey(hostId?: number | null): string {
    const id = Number(hostId ?? GLOBAL_HOST_ID)
    return Number.isFinite(id) && id > 0 ? `${id}` : `${GLOBAL_HOST_ID}`
  }

  private normalizeHostId(hostId?: number | null): number {
    const id = Number(hostId ?? GLOBAL_HOST_ID)
    return Number.isFinite(id) && id > 0 ? id : GLOBAL_HOST_ID
  }

  private normalizeJob(job: CronJob, hostId: number): CronJob {
    const normalizedHostId = this.normalizeHostId(job.hostId ?? hostId)
    const scope = job.scope ?? (normalizedHostId > 0 ? 'host' : 'global')
    return {
      ...job,
      hostId: normalizedHostId > 0 ? normalizedHostId : undefined,
      scope
    }
  }

  private normalizeCronData(data: CronStorageData): CronStorageData {
    const normalized: CronStorageData = {}
    for (const [key, jobs] of Object.entries(data || {})) {
      const hostId = this.normalizeHostId(Number(key))
      const storageKey = this.storageKey(hostId)
      normalized[storageKey] = Array.isArray(jobs)
        ? jobs.map((job) => this.normalizeJob(job, hostId))
        : []
    }
    if (!normalized[this.storageKey(GLOBAL_HOST_ID)]) {
      normalized[this.storageKey(GLOBAL_HOST_ID)] = []
    }
    return normalized
  }

  private flattenJobs(data: CronStorageData): CronJob[] {
    return Object.values(data)
      .flat()
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  }

  private findJob(data: CronStorageData, hostId: number | undefined | null, jobId: string) {
    const preferredKey = typeof hostId === 'number' ? this.storageKey(hostId) : ''
    const keys = preferredKey
      ? [preferredKey, ...Object.keys(data).filter((key) => key !== preferredKey)]
      : Object.keys(data)

    for (const key of keys) {
      const jobs = data[key] || []
      const index = jobs.findIndex((job) => job.id === jobId)
      if (index >= 0) {
        return {
          key,
          hostId: this.normalizeHostId(Number(key)),
          jobs,
          index,
          job: jobs[index]
        }
      }
    }

    return undefined
  }

  private validateCronSchedule(schedule: string) {
    assertPortableCronExpression(schedule)
  }

  private computeNextRunTime(schedule: string, fromDate: Date): number {
    try {
      return computeNextCronRun(schedule, fromDate)
    } catch {
      return 0
    }
  }

  private async ensureNextRunTimes(data: CronStorageData): Promise<boolean> {
    const now = new Date()
    let changed = false

    for (const jobs of Object.values(data)) {
      for (const job of jobs) {
        const nextTs = job.enabled ? this.computeNextRunTime(job.schedule, now) : 0
        if ((job.nextRunTime ?? 0) !== nextTs) {
          job.nextRunTime = nextTs
          changed = true
        }
      }
    }

    return changed
  }

  private async executeCommand(
    command: string,
    workDir: string
  ): Promise<{ output: string; error: string; exitCode: number; duration: number }> {
    const cwd = workDir && existsSync(workDir) ? workDir : this.homePath()
    const start = Date.now()
    let output = ''
    let error = ''
    let exitCode = 0

    try {
      const result = await execPromise(command, {
        cwd,
        timeout: 60000,
        shell: isWindows() ? undefined : process.env.SHELL || (isMacOS() ? '/bin/zsh' : '/bin/bash')
      })
      output = result.stdout?.toString() || ''
      error = result.stderr?.toString() || ''
    } catch (err: any) {
      output = err?.stdout?.toString?.() || ''
      error = err?.stderr?.toString?.() || err?.message || String(err)
      exitCode = typeof err?.code === 'number' ? err.code : 1
    }

    return { output, error, exitCode, duration: Date.now() - start }
  }

  private runLogPath(jobId: string): string {
    return join(this.cronRoot, 'runs', `${jobId}.jsonl`)
  }

  private taskScriptPath(jobId: string, ext: 'sh' | 'ps1' | 'cmd'): string {
    return join(this.cronRoot, 'tasks', `${jobId}.${ext}`)
  }

  private systemTaskName(jobId: string): string {
    return `FlyEnv-Cron-${jobId}`
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`
  }

  private cmdQuote(value: string): string {
    return `"${value.replace(/"/g, '""')}"`
  }

  private base64(value: string): string {
    return Buffer.from(value, 'utf-8').toString('base64')
  }

  private decodeBase64(value?: string): string {
    if (!value) {
      return ''
    }
    try {
      return Buffer.from(value, 'base64').toString('utf-8')
    } catch {
      return ''
    }
  }

  private normalizeRunRecord(raw: any): CronRunRecord {
    return {
      ...raw,
      output: raw?.output ?? this.decodeBase64(raw?.outputBase64),
      error: raw?.error ?? this.decodeBase64(raw?.errorBase64)
    }
  }

  private async readRunRecords(jobId: string, limit = RUN_HISTORY_LIMIT): Promise<CronRunRecord[]> {
    const file = this.runLogPath(jobId)
    if (!existsSync(file)) {
      return []
    }

    const content = await readFile(file, 'utf-8')
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return this.normalizeRunRecord(JSON.parse(line))
        } catch {
          return undefined
        }
      })
      .filter(Boolean) as CronRunRecord[]
  }

  private async readLatestRun(jobId: string): Promise<CronRunRecord | undefined> {
    const records = await this.readRunRecords(jobId, 1)
    return records[0]
  }

  private async appendRunRecord(
    job: CronJob,
    result: {
      output: string
      error: string
      exitCode: number
      duration: number
    }
  ): Promise<CronRunRecord> {
    const finishedAt = Date.now()
    const record: CronRunRecord = {
      id: uuid(),
      jobId: job.id,
      hostId: job.hostId,
      scope: job.scope,
      startedAt: finishedAt - result.duration,
      finishedAt,
      duration: result.duration,
      exitCode: result.exitCode,
      output: result.output,
      error: result.error
    }

    const file = this.runLogPath(job.id)
    await mkdirp(dirname(file))
    await appendFile(file, `${JSON.stringify(record)}\n`)
    return record
  }

  private applyRunRecordToJob(job: CronJob, record: CronRunRecord): boolean {
    if (!record?.finishedAt || (job.lastRunTime ?? 0) >= record.finishedAt) {
      return false
    }
    job.lastRunTime = record.finishedAt
    job.lastOutput = record.output ?? ''
    job.lastError = record.error ?? ''
    job.lastExitCode = record.exitCode
    job.updatedAt = Math.max(job.updatedAt ?? 0, record.finishedAt)
    return true
  }

  private async syncLatestRunRecords(data: CronStorageData): Promise<boolean> {
    let changed = false
    for (const job of this.flattenJobs(data)) {
      const record = await this.readLatestRun(job.id)
      if (record && this.applyRunRecordToJob(job, record)) {
        changed = true
      }
    }
    return changed
  }

  private async writeUnixWrapper(job: CronJob): Promise<string> {
    const file = this.taskScriptPath(job.id, 'sh')
    const workDir = job.workDir || this.homePath()
    const runDir = join(this.cronRoot, 'tmp')
    const logFile = this.runLogPath(job.id)
    const shell = process.env.SHELL || (isMacOS() ? '/bin/zsh' : '/bin/bash')
    const scope = job.scope ?? (job.hostId ? 'host' : 'global')
    const shellHostId = '${HOST_ID:-null}'

    const content = `#!/bin/sh
JOB_ID=${this.shellQuote(job.id)}
HOST_ID=${this.shellQuote(job.hostId ? `${job.hostId}` : '')}
SCOPE=${this.shellQuote(scope)}
COMMAND=${this.shellQuote(job.command)}
WORK_DIR=${this.shellQuote(workDir)}
RUN_DIR=${this.shellQuote(runDir)}
LOG_FILE=${this.shellQuote(logFile)}
RUN_SHELL=${this.shellQuote(shell)}
LOCK_DIR="$RUN_DIR/$JOB_ID.lock"

mkdir -p "$RUN_DIR" "$(dirname "$LOG_FILE")"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  exit 0
fi

RUN_ID="$(date +%Y%m%d%H%M%S)-$$"
OUT_FILE="$RUN_DIR/$JOB_ID-$RUN_ID.out"
ERR_FILE="$RUN_DIR/$JOB_ID-$RUN_ID.err"
STARTED_AT=$(($(date +%s) * 1000))

cleanup() {
  rm -f "$OUT_FILE" "$ERR_FILE"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [ ! -d "$WORK_DIR" ]; then
  printf '%s' "Work directory not found: $WORK_DIR" > "$ERR_FILE"
  : > "$OUT_FILE"
  EXIT_CODE=1
else
  cd "$WORK_DIR" || true
  "$RUN_SHELL" -lc "$COMMAND" > "$OUT_FILE" 2> "$ERR_FILE"
  EXIT_CODE=$?
fi

FINISHED_AT=$(($(date +%s) * 1000))
DURATION=$((FINISHED_AT - STARTED_AT))
OUT_B64=$(base64 < "$OUT_FILE" | tr -d '\\n')
ERR_B64=$(base64 < "$ERR_FILE" | tr -d '\\n')

printf '{"id":"%s","jobId":"%s","hostId":%s,"scope":"%s","startedAt":%s,"finishedAt":%s,"duration":%s,"exitCode":%s,"outputBase64":"%s","errorBase64":"%s"}\\n' \\
  "$RUN_ID" "$JOB_ID" "${shellHostId}" "$SCOPE" "$STARTED_AT" "$FINISHED_AT" "$DURATION" "$EXIT_CODE" "$OUT_B64" "$ERR_B64" >> "$LOG_FILE"
exit "$EXIT_CODE"
`

    await mkdirp(dirname(file))
    await writeFile(file, content)
    await chmod(file, 0o755)
    return file
  }

  private unixCronMatcherScript(): string {
    return `flyenv_cron_matches_now() {
  date '+%Y %m %d %H %M %w' | awk -v schedule="$SCHEDULE" '
function is_num(s) { return s ~ /^[0-9]+$/ }
function last_day(y, m) {
  if (m == 2) {
    return ((y % 4 == 0 && y % 100 != 0) || y % 400 == 0) ? 29 : 28
  }
  return (m == 4 || m == 6 || m == 9 || m == 11) ? 30 : 31
}
function dow_of(y, m, d, yy) {
  yy = y
  if (m < 3) { yy-- }
  return (yy + int(yy / 4) - int(yy / 100) + int(yy / 400) + month_offsets[m] + d) % 7
}
function last_weekday(y, m, d, w) {
  for (d = last_day(y, m); d >= last_day(y, m) - 6; d--) {
    w = dow_of(y, m, d)
    if (w >= 1 && w <= 5) { return d }
  }
  return last_day(y, m)
}
function nearest_weekday(y, m, d, last, w) {
  last = last_day(y, m)
  if (d < 1 || d > last) { return -1 }
  w = dow_of(y, m, d)
  if (w >= 1 && w <= 5) { return d }
  if (w == 6) { return d == 1 ? 3 : d - 1 }
  return d == last ? d - 2 : d + 1
}
function normalize_names(s, kind) {
  s = toupper(s)
  if (kind == "month") {
    gsub(/JAN/, "1", s); gsub(/FEB/, "2", s); gsub(/MAR/, "3", s); gsub(/APR/, "4", s)
    gsub(/MAY/, "5", s); gsub(/JUN/, "6", s); gsub(/JUL/, "7", s); gsub(/AUG/, "8", s)
    gsub(/SEP/, "9", s); gsub(/OCT/, "10", s); gsub(/NOV/, "11", s); gsub(/DEC/, "12", s)
  } else if (kind == "dow") {
    gsub(/SUN/, "0", s); gsub(/MON/, "1", s); gsub(/TUE/, "2", s); gsub(/WED/, "3", s)
    gsub(/THU/, "4", s); gsub(/FRI/, "5", s); gsub(/SAT/, "6", s)
    return s ~ /[^0-9L#*,?\\/\\-]/ ? "" : s
  } else if (kind == "dom") {
    return s ~ /[^0-9LW*,?\\/\\-]/ ? "" : s
  }
  return s ~ /[A-Z]/ ? "" : s
}
function field_wildcard(field, kind) {
  field = toupper(field)
  return field == "*" || ((kind == "dom" || kind == "dow") && field == "?")
}
function in_range(v, min, max) { return v >= min && v <= max }
function norm_dow(v) { return v == 7 ? 0 : v }
function match_range_segment(segment, value, min, max, kind, step_parts, step_count, base, step, range_parts, range_count, start, end, current, candidate) {
  step_count = split(segment, step_parts, "/")
  if (step_count > 2) { return 0 }
  base = step_parts[1]
  if (base == "") { return 0 }
  step = 1
  if (step_count == 2) {
    if (!is_num(step_parts[2])) { return 0 }
    step = step_parts[2] + 0
    if (step <= 0) { return 0 }
  }
  if (base == "*") {
    start = min
    end = max
  } else if (index(base, "-") > 0) {
    range_count = split(base, range_parts, "-")
    if (range_count != 2 || !is_num(range_parts[1]) || !is_num(range_parts[2])) { return 0 }
    start = range_parts[1] + 0
    end = range_parts[2] + 0
    if (!in_range(start, min, max) || !in_range(end, min, max) || start > end) { return 0 }
  } else {
    if (!is_num(base)) { return 0 }
    start = base + 0
    end = start
    if (!in_range(start, min, max)) { return 0 }
  }
  for (current = start; current <= end; current += step) {
    candidate = kind == "dow" ? norm_dow(current) : current
    if (candidate == value) { return 1 }
  }
  return 0
}
function match_dom_segment(segment, y, m, dom, d) {
  if (segment == "L") { return dom == last_day(y, m) }
  if (segment == "LW") { return dom == last_weekday(y, m) }
  if (segment ~ /^[0-9]+W$/) {
    d = substr(segment, 1, length(segment) - 1) + 0
    return dom == nearest_weekday(y, m, d)
  }
  return match_range_segment(segment, dom, 1, 31, "dom")
}
function match_dow_segment(segment, y, m, dom, dow, parts, wd, nth) {
  if (segment ~ /^[0-9]+L$/) {
    wd = norm_dow(substr(segment, 1, length(segment) - 1) + 0)
    return dow == wd && dom + 7 > last_day(y, m)
  }
  if (segment ~ /^[0-9]+#[1-5]$/) {
    split(segment, parts, "#")
    wd = norm_dow(parts[1] + 0)
    nth = parts[2] + 0
    return dow == wd && int((dom - 1) / 7) + 1 == nth
  }
  return match_range_segment(segment, dow, 0, 7, "dow")
}
function match_field(field, value, min, max, kind, y, m, dom, dow, normalized, segments, count, i, segment) {
  normalized = normalize_names(field, kind)
  if (normalized == "") { return 0 }
  if (field_wildcard(normalized, kind)) { return 1 }
  count = split(normalized, segments, ",")
  for (i = 1; i <= count; i++) {
    segment = segments[i]
    if (segment == "" || segment ~ /\\?/) { return 0 }
    if (kind == "dom") {
      if (match_dom_segment(segment, y, m, dom)) { return 1 }
    } else if (kind == "dow") {
      if (match_dow_segment(segment, y, m, dom, dow)) { return 1 }
    } else if (match_range_segment(segment, value, min, max, kind)) {
      return 1
    }
  }
  return 0
}
BEGIN {
  split("0 3 2 5 0 3 5 1 4 6 2 4", month_offsets, " ")
  count = split(schedule, fields, /[[:space:]]+/)
  if (count != 5) { exit 1 }
}
{
  y = $1 + 0; m = $2 + 0; dom = $3 + 0; hour = $4 + 0; minute = $5 + 0; dow = $6 + 0
  minute_ok = match_field(fields[1], minute, 0, 59, "minute", y, m, dom, dow)
  hour_ok = match_field(fields[2], hour, 0, 23, "hour", y, m, dom, dow)
  dom_ok = match_field(fields[3], dom, 1, 31, "dom", y, m, dom, dow)
  month_ok = match_field(fields[4], m, 1, 12, "month", y, m, dom, dow)
  dow_ok = match_field(fields[5], dow, 0, 7, "dow", y, m, dom, dow)
  date_ok = (!field_wildcard(fields[3], "dom") && !field_wildcard(fields[5], "dow")) ? (dom_ok || dow_ok) : (dom_ok && dow_ok)
  exit (minute_ok && hour_ok && month_ok && date_ok) ? 0 : 1
}'
}
`
  }

  private windowsCronMatcherScript(): string {
    return `
function Test-CronNumber([string]$Value) {
  return $Value -match '^\\d+$'
}

function Normalize-CronWeekday([int]$Value) {
  if ($Value -eq 7) { return 0 }
  return $Value
}

function Normalize-CronField([string]$Field, [string]$Kind) {
  $text = $Field.Trim().ToUpperInvariant()
  $map = @{}
  if ($Kind -eq 'month') {
    $map = @{ JAN = 1; FEB = 2; MAR = 3; APR = 4; MAY = 5; JUN = 6; JUL = 7; AUG = 8; SEP = 9; OCT = 10; NOV = 11; DEC = 12 }
  } elseif ($Kind -eq 'dow') {
    $map = @{ SUN = 0; MON = 1; TUE = 2; WED = 3; THU = 4; FRI = 5; SAT = 6 }
  }

  if ($map.Count -gt 0) {
    $text = [regex]::Replace($text, '[A-Z]{3}', {
      param($match)
      if ($map.ContainsKey($match.Value)) {
        return [string]$map[$match.Value]
      }
      return '__ERR__'
    })
  }

  if ($Kind -eq 'dom') {
    if ($text -match '[^0-9LW*,?/\\-]') { return $null }
    return $text
  }
  if ($Kind -eq 'dow') {
    if ($text -match '[^0-9L#*,?/\\-]') { return $null }
    return $text
  }
  if ($text -match '[A-Z]') { return $null }
  return $text
}

function Test-CronFieldWildcard([string]$Field, [string]$Kind) {
  $text = $Field.Trim().ToUpperInvariant()
  return $text -eq '*' -or (($Kind -eq 'dom' -or $Kind -eq 'dow') -and $text -eq '?')
}

function Test-CronRangeSegment([string]$Segment, [int]$Value, [int]$Min, [int]$Max, [string]$Kind) {
  $stepParts = $Segment.Split('/')
  if ($stepParts.Count -gt 2) { return $false }
  $base = $stepParts[0]
  if (-not $base) { return $false }
  $step = 1
  if ($stepParts.Count -eq 2) {
    if (-not (Test-CronNumber $stepParts[1])) { return $false }
    $step = [int]$stepParts[1]
    if ($step -le 0) { return $false }
  }

  if ($base -eq '*') {
    $rangeStart = $Min
    $rangeEnd = $Max
  } elseif ($base.Contains('-')) {
    $range = $base.Split('-')
    if ($range.Count -ne 2 -or -not (Test-CronNumber $range[0]) -or -not (Test-CronNumber $range[1])) { return $false }
    $rangeStart = [int]$range[0]
    $rangeEnd = [int]$range[1]
    if ($rangeStart -lt $Min -or $rangeStart -gt $Max -or $rangeEnd -lt $Min -or $rangeEnd -gt $Max -or $rangeStart -gt $rangeEnd) { return $false }
  } else {
    if (-not (Test-CronNumber $base)) { return $false }
    $rangeStart = [int]$base
    $rangeEnd = $rangeStart
    if ($rangeStart -lt $Min -or $rangeStart -gt $Max) { return $false }
  }

  for ($current = $rangeStart; $current -le $rangeEnd; $current += $step) {
    $candidate = if ($Kind -eq 'dow') { Normalize-CronWeekday $current } else { $current }
    if ($candidate -eq $Value) { return $true }
  }
  return $false
}

function Get-LastWeekdayOfMonth([int]$Year, [int]$Month) {
  $lastDay = [DateTime]::DaysInMonth($Year, $Month)
  for ($day = $lastDay; $day -ge ($lastDay - 6); $day--) {
    $weekday = [int]([DateTime]::new($Year, $Month, $day).DayOfWeek)
    if ($weekday -ge 1 -and $weekday -le 5) { return $day }
  }
  return $lastDay
}

function Get-NearestWeekday([int]$Year, [int]$Month, [int]$Day) {
  $lastDay = [DateTime]::DaysInMonth($Year, $Month)
  if ($Day -lt 1 -or $Day -gt $lastDay) { return $null }
  $weekday = [int]([DateTime]::new($Year, $Month, $Day).DayOfWeek)
  if ($weekday -ge 1 -and $weekday -le 5) { return $Day }
  if ($weekday -eq 6) {
    if ($Day -eq 1) { return 3 }
    return $Day - 1
  }
  if ($Day -eq $lastDay) { return $Day - 2 }
  return $Day + 1
}

function Test-CronDomSegment([string]$Segment, [DateTime]$Now) {
  if ($Segment -eq 'L') {
    return $Now.Day -eq [DateTime]::DaysInMonth($Now.Year, $Now.Month)
  }
  if ($Segment -eq 'LW') {
    return $Now.Day -eq (Get-LastWeekdayOfMonth $Now.Year $Now.Month)
  }
  if ($Segment -match '^(\\d+)W$') {
    $nearest = Get-NearestWeekday $Now.Year $Now.Month ([int]$Matches[1])
    return $null -ne $nearest -and $Now.Day -eq $nearest
  }
  return Test-CronRangeSegment $Segment $Now.Day 1 31 'dom'
}

function Test-CronDowSegment([string]$Segment, [DateTime]$Now) {
  $dow = [int]$Now.DayOfWeek
  if ($Segment -match '^(\\d+)L$') {
    $weekday = Normalize-CronWeekday ([int]$Matches[1])
    return $dow -eq $weekday -and ($Now.Day + 7) -gt [DateTime]::DaysInMonth($Now.Year, $Now.Month)
  }
  if ($Segment -match '^(\\d+)#([1-5])$') {
    $weekday = Normalize-CronWeekday ([int]$Matches[1])
    $nth = [int]$Matches[2]
    return $dow -eq $weekday -and ([Math]::Floor(($Now.Day - 1) / 7) + 1) -eq $nth
  }
  return Test-CronRangeSegment $Segment $dow 0 7 'dow'
}

function Test-CronField([string]$Field, [int]$Value, [int]$Min, [int]$Max, [string]$Kind, [DateTime]$Now) {
  $normalized = Normalize-CronField $Field $Kind
  if ($null -eq $normalized) { return $false }
  if (Test-CronFieldWildcard $normalized $Kind) { return $true }
  $segments = $normalized.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  foreach ($segment in $segments) {
    if ($segment.Contains('?')) { return $false }
    if ($Kind -eq 'dom') {
      if (Test-CronDomSegment $segment $Now) { return $true }
    } elseif ($Kind -eq 'dow') {
      if (Test-CronDowSegment $segment $Now) { return $true }
    } elseif (Test-CronRangeSegment $segment $Value $Min $Max $Kind) {
      return $true
    }
  }
  return $false
}

function Test-CronNow([string]$Schedule) {
  $parts = [regex]::Split($Schedule.Trim(), '\\s+') | Where-Object { $_ }
  if ($parts.Count -ne 5) { return $false }
  $now = Get-Date
  $minuteOk = Test-CronField $parts[0] $now.Minute 0 59 'minute' $now
  $hourOk = Test-CronField $parts[1] $now.Hour 0 23 'hour' $now
  $dayOk = Test-CronField $parts[2] $now.Day 1 31 'dom' $now
  $monthOk = Test-CronField $parts[3] $now.Month 1 12 'month' $now
  $weekdayOk = Test-CronField $parts[4] ([int]$now.DayOfWeek) 0 7 'dow' $now
  $dayRestricted = -not (Test-CronFieldWildcard $parts[2] 'dom')
  $weekdayRestricted = -not (Test-CronFieldWildcard $parts[4] 'dow')
  $dateOk = if ($dayRestricted -and $weekdayRestricted) { $dayOk -or $weekdayOk } else { $dayOk -and $weekdayOk }
  return $minuteOk -and $hourOk -and $dateOk -and $monthOk
}
`
  }

  private async writeWindowsWrapper(job: CronJob): Promise<string> {
    const psFile = this.taskScriptPath(job.id, 'ps1')
    const cmdFile = this.taskScriptPath(job.id, 'cmd')
    const workDir = job.workDir || this.homePath()
    const runDir = join(this.cronRoot, 'tmp')
    const logFile = this.runLogPath(job.id)
    const scope = job.scope ?? (job.hostId ? 'host' : 'global')

    const psContent = `$ErrorActionPreference = 'Continue'
$JobId = '${job.id}'
$HostId = '${job.hostId ? `${job.hostId}` : ''}'
$Scope = '${scope}'
$Command = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${this.base64(job.command)}'))
$WorkDir = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${this.base64(workDir)}'))
$RunDir = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${this.base64(runDir)}'))
$LogFile = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${this.base64(logFile)}'))

New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$LockDir = Join-Path $RunDir "$JobId.lock"
try {
  New-Item -ItemType Directory -Path $LockDir -ErrorAction Stop | Out-Null
} catch {
  exit 0
}

$RunId = "$(Get-Date -Format yyyyMMddHHmmss)-$PID"
$OutFile = Join-Path $RunDir "$JobId-$RunId.out"
$ErrFile = Join-Path $RunDir "$JobId-$RunId.err"
$CmdFile = Join-Path $RunDir "$JobId-$RunId.cmd"
$StartedAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$ExitCode = 0

try {
  if (-not (Test-Path -LiteralPath $WorkDir -PathType Container)) {
    [IO.File]::WriteAllText($ErrFile, "Work directory not found: $WorkDir", [Text.Encoding]::UTF8)
    [IO.File]::WriteAllText($OutFile, '', [Text.Encoding]::UTF8)
    $ExitCode = 1
  } else {
    [IO.File]::WriteAllText($CmdFile, '@echo off' + [Environment]::NewLine + $Command + [Environment]::NewLine, [Text.Encoding]::UTF8)
    $process = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/s', '/c', '"' + $CmdFile + '"') -WorkingDirectory $WorkDir -Wait -PassThru -RedirectStandardOutput $OutFile -RedirectStandardError $ErrFile
    $ExitCode = $process.ExitCode
  }
} catch {
  [IO.File]::WriteAllText($OutFile, '', [Text.Encoding]::UTF8)
  [IO.File]::WriteAllText($ErrFile, $_.Exception.Message, [Text.Encoding]::UTF8)
  $ExitCode = 1
}

$FinishedAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$record = [ordered]@{
  id = $RunId
  jobId = $JobId
  hostId = if ($HostId) { [int]$HostId } else { $null }
  scope = $Scope
  startedAt = $StartedAt
  finishedAt = $FinishedAt
  duration = $FinishedAt - $StartedAt
  exitCode = $ExitCode
  output = if (Test-Path -LiteralPath $OutFile) { [IO.File]::ReadAllText($OutFile) } else { '' }
  error = if (Test-Path -LiteralPath $ErrFile) { [IO.File]::ReadAllText($ErrFile) } else { '' }
}
($record | ConvertTo-Json -Compress -Depth 4) | Add-Content -Encoding UTF8 -LiteralPath $LogFile
Remove-Item -Force -LiteralPath $OutFile, $ErrFile, $CmdFile -ErrorAction SilentlyContinue
Remove-Item -Force -LiteralPath $LockDir -ErrorAction SilentlyContinue
exit $ExitCode
`
    const cmdContent = `@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0${job.id}.ps1"\r\n`

    await mkdirp(dirname(psFile))
    await writeFile(psFile, psContent)
    await writeFile(cmdFile, cmdContent)
    return cmdFile
  }

  private async readUnixCrontab(): Promise<string> {
    try {
      const res = await execPromise('crontab -l')
      return res.stdout?.toString() || ''
    } catch {
      return ''
    }
  }

  private removeCronBlock(content: string, jobId: string): string {
    const start = `# FlyEnv Cron Start ${jobId}`
    const end = `# FlyEnv Cron End ${jobId}`
    const result: string[] = []
    let removing = false

    for (const line of content.split(/\r?\n/)) {
      if (line.trim() === start) {
        removing = true
        continue
      }
      if (line.trim() === end) {
        removing = false
        continue
      }
      if (!removing && line.trim()) {
        result.push(line)
      }
    }

    return result.join('\n')
  }

  private async installUnixCrontab(job: CronJob, scriptPath: string) {
    const current = await this.readUnixCrontab()
    const withoutJob = this.removeCronBlock(current, job.id)
    const start = `# FlyEnv Cron Start ${job.id}`
    const end = `# FlyEnv Cron End ${job.id}`
    const line = `${job.schedule} ${this.shellQuote(scriptPath)} >/dev/null 2>&1`
    const next = [withoutJob, start, line, end]
      .filter((part) => `${part}`.trim().length > 0)
      .join('\n')
      .trimEnd()

    const tmpFile = join(tmpdir(), `flyenv-crontab-${uuid()}`)
    await writeFile(tmpFile, `${next}\n`)
    try {
      await execPromise(`crontab ${this.shellQuote(tmpFile)}`)
    } finally {
      await remove(tmpFile).catch(() => {})
    }
  }

  private async removeUnixCrontab(jobId: string) {
    const current = await this.readUnixCrontab()
    const withoutJob = this.removeCronBlock(current, jobId)
    const tmpFile = join(tmpdir(), `flyenv-crontab-${uuid()}`)
    await writeFile(tmpFile, withoutJob.trimEnd() ? `${withoutJob.trimEnd()}\n` : '')
    try {
      await execPromise(`crontab ${this.shellQuote(tmpFile)}`)
    } finally {
      await remove(tmpFile).catch(() => {})
    }
  }

  private windowsTaskTime(hour: number, minute: number): string {
    return `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`
  }

  private windowsWeekdayName(day: number): string {
    return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][day]
  }

  private windowsMonthName(month: number): string {
    return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][
      month - 1
    ]
  }

  private windowsScheduleArgs(schedule: PortableCronSchedule): string[] {
    switch (schedule.type) {
      case 'minute':
        return ['/SC', 'MINUTE', '/MO', `${schedule.interval}`, '/ST', '00:00']
      case 'hourly':
        return [
          '/SC',
          'HOURLY',
          '/MO',
          `${schedule.interval}`,
          '/ST',
          this.windowsTaskTime(0, schedule.minute)
        ]
      case 'daily':
        return [
          '/SC',
          'DAILY',
          '/MO',
          '1',
          '/ST',
          this.windowsTaskTime(schedule.hour, schedule.minute)
        ]
      case 'weekly':
        return [
          '/SC',
          'WEEKLY',
          '/D',
          schedule.weekdays.map((day) => this.windowsWeekdayName(day)).join(','),
          '/ST',
          this.windowsTaskTime(schedule.hour, schedule.minute)
        ]
      case 'monthly': {
        const monthArg =
          schedule.months.length === 12
            ? '*'
            : schedule.months.map((month) => this.windowsMonthName(month)).join(',')
        return [
          '/SC',
          'MONTHLY',
          '/D',
          `${schedule.day}`,
          '/M',
          monthArg,
          '/ST',
          this.windowsTaskTime(schedule.hour, schedule.minute)
        ]
      }
    }
  }

  private async installWindowsTask(job: CronJob, cmdPath: string) {
    const schedule = getPortableCronSchedule(job.schedule)
    await execPromise(
      [
        'schtasks',
        '/Create',
        '/TN',
        this.cmdQuote(this.systemTaskName(job.id)),
        ...this.windowsScheduleArgs(schedule),
        '/TR',
        this.cmdQuote(cmdPath),
        '/F'
      ].join(' ')
    )
  }

  private async removeWindowsTask(jobId: string) {
    await execPromise(
      ['schtasks', '/Delete', '/TN', this.cmdQuote(this.systemTaskName(jobId)), '/F'].join(' ')
    ).catch(() => {})
  }

  private async removeSystemCronJob(jobId: string) {
    if (isLinux() || isMacOS()) {
      await this.removeUnixCrontab(jobId)
      await remove(this.taskScriptPath(jobId, 'sh')).catch(() => {})
    } else if (isWindows()) {
      await this.removeWindowsTask(jobId)
      await remove(this.taskScriptPath(jobId, 'ps1')).catch(() => {})
      await remove(this.taskScriptPath(jobId, 'cmd')).catch(() => {})
    }
  }

  private async applySystemCronJob(job: CronJob): Promise<CronJob> {
    await this.removeSystemCronJob(job.id)

    if (!job.enabled) {
      return {
        ...job,
        systemRegistered: false,
        systemTaskName: undefined,
        systemError: undefined
      }
    }

    this.validateCronSchedule(job.schedule)
    await mkdirp(this.cronRoot)

    try {
      if (isLinux() || isMacOS()) {
        const scriptPath = await this.writeUnixWrapper(job)
        await this.installUnixCrontab(job, scriptPath)
      } else if (isWindows()) {
        const cmdPath = await this.writeWindowsWrapper(job)
        await this.installWindowsTask(job, cmdPath)
      }

      return {
        ...job,
        systemRegistered: true,
        systemTaskName: this.systemTaskName(job.id),
        systemError: undefined
      }
    } catch (e: any) {
      return {
        ...job,
        systemRegistered: false,
        systemTaskName: this.systemTaskName(job.id),
        systemError: e?.message || `${e}`
      }
    }
  }

  private async syncSystemCronJobs(): Promise<void> {
    const data = await this.loadCronData()
    let changed = false

    for (const [key, jobs] of Object.entries(data)) {
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i]
        let applied: CronJob
        try {
          applied = await this.applySystemCronJob(job)
        } catch (e: any) {
          applied = {
            ...job,
            systemRegistered: false,
            systemTaskName: this.systemTaskName(job.id),
            systemError: e?.message || `${e}`
          }
        }
        if (JSON.stringify(applied) !== JSON.stringify(job)) {
          jobs[i] = applied
          changed = true
        }
      }
      data[key] = jobs
    }

    if ((await this.ensureNextRunTimes(data)) || (await this.syncLatestRunRecords(data))) {
      changed = true
    }

    if (changed) {
      await this.saveCronData(data)
    }
  }

  private resolveJobHostId(hostId: number | undefined | null, job: Partial<CronJob>): number {
    if (job.scope === 'global') {
      return GLOBAL_HOST_ID
    }
    return this.normalizeHostId(job.hostId ?? hostId)
  }

  addCronJob(
    hostId: number | undefined | null,
    job: Omit<CronJob, 'id' | 'createdAt' | 'updatedAt'>
  ): ForkPromise<CronJob> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const targetHostId = this.resolveJobHostId(hostId, job)
        const scope = targetHostId > 0 ? 'host' : 'global'
        const newJob: CronJob = {
          ...job,
          id: uuid(),
          hostId: targetHostId > 0 ? targetHostId : undefined,
          scope,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          nextRunTime: job.enabled ? this.computeNextRunTime(job.schedule, new Date()) : 0
        }
        const appliedJob = await this.applySystemCronJob(newJob)
        const key = this.storageKey(targetHostId)
        data[key] = data[key] || []
        data[key].push(appliedJob)
        await this.saveCronData(data)
        resolve(appliedJob)
      } catch (error) {
        reject(error)
      }
    })
  }

  updateCronJob(
    hostId: number | undefined | null,
    jobId: string,
    updates: Partial<CronJob>
  ): ForkPromise<CronJob> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const found = this.findJob(data, hostId, jobId)

        if (!found) {
          throw new Error('Cron job not found')
        }

        const targetHostId = this.resolveJobHostId(found.hostId, updates)
        const targetKey = this.storageKey(targetHostId)
        const updatedJob: CronJob = {
          ...found.job,
          ...updates,
          id: jobId,
          hostId: targetHostId > 0 ? targetHostId : undefined,
          scope: targetHostId > 0 ? 'host' : 'global',
          createdAt: found.job.createdAt,
          updatedAt: Date.now(),
          nextRunTime:
            (updates.enabled ?? found.job.enabled)
              ? this.computeNextRunTime(updates.schedule ?? found.job.schedule, new Date())
              : 0
        }

        const appliedJob = await this.applySystemCronJob(updatedJob)
        found.jobs.splice(found.index, 1)
        data[found.key] = found.jobs
        data[targetKey] = data[targetKey] || []
        data[targetKey].push(appliedJob)
        await this.saveCronData(data)

        resolve(appliedJob)
      } catch (error) {
        reject(error)
      }
    })
  }

  deleteCronJob(hostId: number | undefined | null, jobId: string): ForkPromise<boolean> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const found = this.findJob(data, hostId, jobId)

        if (!found) {
          throw new Error('Cron job not found')
        }

        await this.removeSystemCronJob(jobId)
        found.jobs.splice(found.index, 1)
        data[found.key] = found.jobs
        await this.saveCronData(data)

        resolve(true)
      } catch (error) {
        reject(error)
      }
    })
  }

  getCronJobs(hostId?: number | null): ForkPromise<CronJob[]> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const changedNext = await this.ensureNextRunTimes(data)
        const changedRuns = await this.syncLatestRunRecords(data)
        if (changedNext || changedRuns) {
          await this.saveCronData(data)
        }
        if (typeof hostId === 'number') {
          resolve(data[this.storageKey(hostId)] || [])
          return
        }
        resolve(this.flattenJobs(data))
      } catch (error) {
        reject(error)
      }
    })
  }

  private loadCronData(): ForkPromise<CronStorageData> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (existsSync(this.cronDataPath)) {
          const content = await readFile(this.cronDataPath, 'utf-8')
          const data = JSON.parse(content || '{}') as CronStorageData
          resolve(this.normalizeCronData(data))
        } else {
          resolve(this.normalizeCronData({}))
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  private saveCronData(data: CronStorageData): ForkPromise<boolean> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await mkdirp(dirname(this.cronDataPath))
        await writeFile(this.cronDataPath, JSON.stringify(this.normalizeCronData(data), null, 2))
        resolve(true)
      } catch (error) {
        reject(error)
      }
    })
  }

  listAllCronJobs(): ForkPromise<CronStorageData> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        if (await this.syncLatestRunRecords(data)) {
          await this.saveCronData(data)
        }
        resolve(data)
      } catch (error) {
        reject(error)
      }
    })
  }

  listRunRecords(jobId: string, limit = RUN_HISTORY_LIMIT): ForkPromise<CronRunRecord[]> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        resolve(await this.readRunRecords(jobId, limit))
      } catch (error) {
        reject(error)
      }
    })
  }

  toggleCronJob(
    hostId: number | undefined | null,
    jobId: string,
    enabled: boolean
  ): ForkPromise<CronJob> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const found = this.findJob(data, hostId, jobId)

        if (!found) {
          throw new Error('Cron job not found')
        }

        const job: CronJob = {
          ...found.job,
          enabled,
          updatedAt: Date.now(),
          nextRunTime: enabled ? this.computeNextRunTime(found.job.schedule, new Date()) : 0
        }
        const appliedJob = await this.applySystemCronJob(job)
        found.jobs[found.index] = appliedJob
        data[found.key] = found.jobs
        await this.saveCronData(data)

        resolve(appliedJob)
      } catch (error) {
        reject(error)
      }
    })
  }

  runJobNow(
    hostId: number | undefined | null,
    jobId: string,
    workDir?: string
  ): ForkPromise<{ output: string; error: string; exitCode: number; duration: number }> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const data = await this.loadCronData()
        const found = this.findJob(data, hostId, jobId)

        if (!found) {
          reject(new Error('Cron job not found'))
          return
        }

        const result = await this.executeCommand(
          found.job.command,
          workDir || found.job.workDir || ''
        )
        await this.appendRunRecord(found.job, result)

        found.jobs[found.index] = {
          ...found.job,
          lastRunTime: Date.now(),
          lastOutput: result.output,
          lastError: result.error,
          lastExitCode: result.exitCode,
          updatedAt: Date.now(),
          nextRunTime: this.computeNextRunTime(found.job.schedule, new Date())
        }
        data[found.key] = found.jobs
        await this.saveCronData(data)

        resolve(result)
      } catch (error) {
        reject(error)
      }
    })
  }

  runCommand(
    workDir: string,
    command: string
  ): ForkPromise<{ output: string; error: string; exitCode: number; duration: number }> {
    return new ForkPromise(async (resolve) => {
      const result = await this.executeCommand(command, workDir)
      resolve(result)
    })
  }
}

export default new Cron()
