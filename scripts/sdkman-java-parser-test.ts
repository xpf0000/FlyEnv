import assert from 'node:assert/strict'
import { parseSdkmanJavaOutput } from '../src/fork/module/Sdkman/parser'

const currentOutput = `
 Vendor         | Use | Version            | Identifier
--------------------------------------------------------------------------------
 Corretto       |     | 26.0.2             | 26.0.2-amzn
                | > * | 8.0.472            | 8.0.472-amzn
 GraalVM CE     |     | 25.3.4+1.r25       | 25.3.4+1.r25-graalce
`

assert.deepEqual(parseSdkmanJavaOutput(currentOutput), [
  {
    name: '26.0.2-amzn',
    version: '26.0.2',
    installed: false,
    flag: 'sdkman',
    vendor: 'Corretto',
    identifier: '26.0.2-amzn'
  },
  {
    name: '8.0.472-amzn',
    version: '8.0.472',
    installed: true,
    flag: 'sdkman',
    vendor: 'Corretto',
    identifier: '8.0.472-amzn'
  },
  {
    name: '25.3.4+1.r25-graalce',
    version: '25.3.4+1.r25',
    installed: false,
    flag: 'sdkman',
    vendor: 'GraalVM CE',
    identifier: '25.3.4+1.r25-graalce'
  }
])

const legacyOutput = `
 Vendor         | Use | Version        | Dist | Status    | Identifier
--------------------------------------------------------------------------------
 Temurin        |     | 21.0.2         | tem  |           | 21.0.2-tem
                | > * | 17.0.10        | tem  | installed | 17.0.10-tem
`

assert.deepEqual(
  parseSdkmanJavaOutput(legacyOutput).map((item) => item.installed),
  [false, true]
)

console.log('sdkman java parser tests passed')
