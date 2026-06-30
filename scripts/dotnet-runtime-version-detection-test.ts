import assert from 'node:assert/strict'
import {
  getDotNetVersionFromInfoOutput,
  getDotNetVersionFromOutput
} from '../src/fork/module/DotNet/version'

const runtimeOnlyInfoOutput = `
Host:
  Version:      8.0.28
  Architecture: x64
  Commit:       46295af582
  RID:          win-x64

.NET SDKs installed:
  No SDKs were found.

.NET runtimes installed:
  Microsoft.NETCore.App 8.0.28 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]
  Microsoft.WindowsDesktop.App 8.0.28 [C:\\Program Files\\dotnet\\shared\\Microsoft.WindowsDesktop.App]
`

assert.equal(getDotNetVersionFromOutput('8.0.409\n'), '8.0.409')
assert.equal(getDotNetVersionFromInfoOutput(runtimeOnlyInfoOutput), '8.0.28')
assert.equal(getDotNetVersionFromOutput(runtimeOnlyInfoOutput), '8.0.28')
assert.equal(getDotNetVersionFromOutput('Usage: dotnet [host-options] [path-to-application]'), '')

console.log('dotnet-runtime-version-detection-test: ok')
