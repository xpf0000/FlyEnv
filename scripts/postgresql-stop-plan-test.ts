import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { planPostgresStop } from '../src/fork/module/Postgresql'

// Issue #896: `Base.startService` always performs a pre-start cleanup through
// `_stopServer`. On Unix that cleanup called `pg_ctl stop` unconditionally, so a
// database that was simply not running made `pg_ctl` exit non-zero
// ("PID file ... does not exist" / "cannot send stop signal") and aborted the start.
// The plan below is the gate that keeps native stop tied to proven liveness.

// Cold cluster: no registration file and nothing running. Nothing to stop, and no
// native call may be attempted, because that call is the reported failure.
assert.deepEqual(planPostgresStop({ recordedPid: '', livePids: [] }), {
  useNativeStop: false,
  unverifiedPids: []
})
console.log('cold cluster passes without a native stop')

// Stale registration from an unclean shutdown: recorded PID is gone, so the instance is
// already down. It must not be treated as running, only as a leftover to clean up.
assert.deepEqual(planPostgresStop({ recordedPid: '4242', livePids: [] }), {
  useNativeStop: false,
  unverifiedPids: []
})
console.log('stale registration does not trigger a native stop')

// Running instance: the recorded PID is alive, so native stop is authorized.
assert.deepEqual(planPostgresStop({ recordedPid: '5150', livePids: ['5150'] }), {
  useNativeStop: true,
  unverifiedPids: []
})
console.log('live registered instance uses the native stop')

// Running instance with workers: only the recorded root authorizes the native stop, and
// its descendants must not be reported as unverified.
assert.deepEqual(planPostgresStop({ recordedPid: '5150', livePids: ['5150', '5151', '5152'] }), {
  useNativeStop: true,
  unverifiedPids: []
})
console.log('live registered root authorizes the stop for its tree')

// A postmaster running for this data directory with no registration authorizing it must
// not be stopped blindly (pg_ctl would follow a possibly reused PID), and the stop must
// not claim success either.
assert.deepEqual(planPostgresStop({ recordedPid: '', livePids: ['7001'] }), {
  useNativeStop: false,
  unverifiedPids: ['7001']
})
console.log('unregistered live instance is surfaced instead of silently stopped')

// A registration that does not match any live process while another root runs: the live
// root stays unverified, and the stale recorded PID is never handed to pg_ctl.
const mismatched = planPostgresStop({ recordedPid: '1111', livePids: ['2222'] })
assert.equal(mismatched.useNativeStop, false)
assert.deepEqual(mismatched.unverifiedPids, ['2222'])
console.log('mismatched registration is not used to stop another process')

// Guard the wiring: the Unix branch must consult the plan before calling pg_ctl, and the
// native call must remain reachable when the instance is genuinely running.
const source = readFileSync(
  new URL('../src/fork/module/Postgresql/index.ts', import.meta.url),
  'utf8'
)
// Assert against a window around the decision site so unrelated edits elsewhere cannot
// break this, and so the checks stay tied to the behaviour rather than to comments.
const decisionAt = source.indexOf('planPostgresStop({')
assert.ok(decisionAt >= 0, 'the Unix stop branch must derive a stop plan')
const unixBranch = source.slice(Math.max(0, decisionAt - 900), decisionAt + 1800)
assert.match(
  unixBranch,
  /planPostgresStop\(\{\s*recordedPid: postmasterPidBefore,\s*livePids: observedRunning\.map/,
  'the plan must be fed the registered PID and the PIDs observed for this data directory'
)
assert.match(
  unixBranch,
  /postgresCommandUsesDataDirectory\(process\.COMMAND, dbPath\)/,
  'observed liveness must match the exact data directory argument'
)
assert.match(
  unixBranch,
  /if \(plan\.useNativeStop\) \{\s*await doStop\(\)/,
  'pg_ctl must only run when the plan authorizes a native stop'
)
assert.match(
  unixBranch,
  /plan\.unverifiedPids\.length[\s\S]{0,400}throw new Error\(/,
  'an unregistered live instance must fail rather than be stopped or reported as stopped'
)
assert.match(
  unixBranch,
  /postgresCommandUsesDataDirectory\(process\.COMMAND, dbPath\)/,
  'liveness must be scoped to the exact data directory'
)
console.log('Unix stop branch consults the plan before running pg_ctl')

console.log('PostgreSQL stop planning regressions passed')
