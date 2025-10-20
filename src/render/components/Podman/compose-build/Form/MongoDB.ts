import { reactive } from 'vue'
import { fs } from '@/util/NodeFn'
import { dirname, join } from '@/util/path-browserify'
import { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import base from './Base'

/**
 * MongoDB Service Configuration
 */
export const MongoDB = reactive({
  enable: false,
  persistence: false,
  version: 'latest',
  ports: [{ in: '27017', out: '27017' }], // Default MongoDB port
  volumes: [
    {
      type: 'bind',
      source: './flyenv-docker-compose/mongodb/data',
      target: '/data/db' // Standard MongoDB data path
    }
  ],
  environment: {
    TZ: currentTimeZone,
    // Credentials for the root user
    MONGO_INITDB_ROOT_USERNAME: 'admin',
    MONGO_INITDB_ROOT_PASSWORD: 'admin_password',
    MONGO_INITDB_DATABASE: 'mydatabase'
  },
  /**
   * Checks if required environment variables are set.
   * @returns {string} Error message or empty string.
   */
  check() {
    return ''
  },
  /**
   * Generates the Docker Compose service object for MongoDB.
   * @returns {Promise<object>} The MongoDB service configuration.
   */
  async build() {
    const mirror = base.mirrorHost()

    const environment = {
      ...MongoDB.environment
    }

    const mongodb: any = {
      image: `${mirror}mongo:${MongoDB.version}`,
      ports: MongoDB.ports.map((p) => `${p.out}:${p.in}`),
      environment,
      networks: ['flyenv-network']
    }

    // If persistence is enabled, add volumes and create the local data directory
    if (MongoDB.persistence) {
      mongodb.volumes = MongoDB.volumes
      await fs.mkdirp(join(dirname(base.dir), 'flyenv-docker-compose/mongodb/data'))
    }

    return {
      mongodb
    }
  }
})

export default MongoDB
