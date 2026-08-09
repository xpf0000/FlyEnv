import type { Configuration } from 'electron-builder'
import productionConfig from './electron-builder'

const config: Configuration = {
  ...productionConfig,
  artifactName: 'FlyEnv-Local-${version}.${ext}',
  mac: {
    ...productionConfig.mac,
    identity: null,
    notarize: false,
    target: [{ target: 'dmg', arch: ['arm64'] }]
  },
  dmg: {
    ...productionConfig.dmg,
    sign: false
  },
  afterSign: undefined,
  publish: []
}

export default config
