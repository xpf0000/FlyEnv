import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { spawnPromiseWithEnv } from '@shared/child-process'
import { isWindows } from '@shared/utils'
import { KafkaT } from '../lang'

export const KAFKA_MIN_JAVA_MAJOR = 17

/**
 * Parse the major version from `java -version` output. Handles both the modern
 * scheme (`openjdk version "17.0.9"`) and the legacy 1.x scheme
 * (`java version "1.8.0_292"` -> 8).
 */
export function javaMajorFromVersion(output: string | null | undefined): number {
  const value = `${output ?? ''}`
  const match =
    value.match(/version\s+"(\d+)(?:\.(\d+))?/i) ?? value.match(/(?:^|[^\d])(\d+)(?:\.(\d+))?/)
  if (!match) return 0
  const first = Number(match[1])
  if (first === 1) {
    const second = Number(match[2])
    return Number.isNaN(second) ? 0 : second
  }
  return first
}

function javaBinForHome(javaHome: string): string {
  return join(javaHome, 'bin', isWindows() ? 'java.exe' : 'java')
}

async function detectJavaMajor(javaBin: string): Promise<number> {
  const result = await spawnPromiseWithEnv(javaBin, ['-version'], {
    cwd: dirname(javaBin),
    shell: false,
    trimOutput: false
  })
  return javaMajorFromVersion(`${result.stdout}\n${result.stderr}`)
}

export async function validateKafkaJava(
  javaHome: string | null | undefined
): Promise<{ javaHome: string; javaBin: string; javaMajor: number }> {
  const home = `${javaHome ?? ''}`.trim()
  if (!home) {
    throw new Error(KafkaT('javaBindRequired', { min: KAFKA_MIN_JAVA_MAJOR }))
  }
  const javaBin = javaBinForHome(home)
  if (!existsSync(javaBin)) {
    throw new Error(KafkaT('javaBinNotFound', { bin: javaBin }))
  }
  const javaMajor = await detectJavaMajor(javaBin)
  if (!javaMajor || javaMajor < KAFKA_MIN_JAVA_MAJOR) {
    throw new Error(
      KafkaT('javaVersionTooOld', { min: KAFKA_MIN_JAVA_MAJOR, major: javaMajor || 'unknown' })
    )
  }
  return { javaHome: home, javaBin, javaMajor }
}
