import { reactive } from 'vue'
import { fs } from '@/util/NodeFn'
import { dirname, join } from '@/util/path-browserify'
import { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import base from './Base'

/**
 * PostgreSQL Service Configuration
 */
export const PostgreSQL = reactive({
  enable: false,
  persistence: false,
  version: 'latest',
  ports: [{ in: '5432', out: '5432' }], // Default PostgreSQL port
  volumes: [
    {
      type: 'bind',
      source: './flyenv-docker-compose/postgresql/data',
      target: '/var/lib/postgresql/data' // Standard PostgreSQL data path
    }
  ],
  environment: {
    TZ: currentTimeZone,
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: 'postgres', // Required password
    POSTGRES_DB: 'mydatabase'
  },
  /**
   * Checks if required environment variables are set.
   * @returns {string} Error message or empty string.
   */
  check() {
    return ''
  },
  /**
   * Generates the Docker Compose service object for PostgreSQL.
   * @returns {Promise<object>} The PostgreSQL service configuration.
   */
  async build() {
    const mirror = base.mirrorHost()

    const environment = {
      ...PostgreSQL.environment
    }

    const postgres: any = {
      image: `${mirror}postgres:${PostgreSQL.version}`,
      ports: PostgreSQL.ports.map((p) => `${p.out}:${p.in}`),
      environment,
      networks: ['flyenv-network']
    }

    // If persistence is enabled, add volumes and create the local data directory
    if (PostgreSQL.persistence) {
      postgres.volumes = PostgreSQL.volumes
      await fs.mkdirp(join(dirname(base.dir), 'flyenv-docker-compose/postgresql/data'))
    }

    return {
      postgres
    }
  }
})

export default PostgreSQL
