import type { AllAppModule } from '@/core/type'

/**
 * 官方镜像映射表
 * key: AllAppModule
 * value: { image: 镜像名, tags: 推荐tag[], desc: 简要说明 }
 */
export const OfficialImages: Partial<
  Record<
    AllAppModule | 'jdk',
    {
      image: string
    }
  >
> = {
  // AI
  ollama: {
    image: 'ollama/ollama'
  },
  // Web服务器
  apache: {
    image: 'httpd'
  },
  nginx: {
    image: 'nginx'
  },
  caddy: {
    image: 'caddy'
  },
  tomcat: {
    image: 'tomcat'
  },
  consul: {
    image: 'consul'
  },

  // 数据库
  mysql: {
    image: 'mysql'
  },
  mariadb: {
    image: 'mariadb'
  },
  postgresql: {
    image: 'postgres'
  },
  mongodb: {
    image: 'mongo'
  },

  // 邮件服务器
  mailpit: {
    image: 'axllent/mailpit'
  },

  // 编程语言 & 运行时
  php: {
    image: 'php'
  },
  composer: {
    image: 'composer'
  },
  java: {
    image: 'openjdk'
  },
  maven: {
    image: 'maven'
  },
  node: {
    image: 'node'
  },
  python: {
    image: 'python'
  },
  golang: {
    image: 'golang'
  },
  erlang: {
    image: 'erlang'
  },
  ruby: {
    image: 'ruby'
  },
  rust: {
    image: 'rust'
  },
  bun: {
    image: 'oven/bun'
  },
  deno: {
    image: 'denoland/deno'
  },
  gradle: {
    image: 'gradle'
  },

  // 数据队列与缓存
  redis: {
    image: 'redis'
  },
  memcached: {
    image: 'memcached'
  },
  rabbitmq: {
    image: 'rabbitmq'
  },
  etcd: {
    image: 'quay.io/coreos/etcd'
  },

  // 搜索引擎
  elasticsearch: {
    image: 'elasticsearch'
  },
  meilisearch: {
    image: 'getmeili/meilisearch'
  },
  typesense: {
    image: 'typesense/typesense'
  },
  jdk: {
    image: 'eclipse-temurin'
  }
}
