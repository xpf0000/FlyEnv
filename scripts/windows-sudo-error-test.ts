import assert from 'node:assert/strict'
import {
  classifyWindowsElevationError,
  WindowsSudoError
} from '../src/shared/Sudo'

const cancelled = classifyWindowsElevationError(new Error('The operation was canceled by the user. (1223)'))
assert.equal(cancelled instanceof WindowsSudoError, true)
assert.equal(cancelled.code, 'elevation_uac_cancelled')

const launchFailed = classifyWindowsElevationError(new Error('powershell.exe was not found'))
assert.equal(launchFailed.code, 'elevation_launch_failed')

const statusTimeout = new WindowsSudoError('elevation_status_timeout', 'Timed out waiting for elevated script status')
assert.equal(statusTimeout.code, 'elevation_status_timeout')

console.log('windows-sudo-error-test: ok')
