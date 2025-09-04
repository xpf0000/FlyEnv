/**
 * 官方镜像映射表
 * key: AllAppModule
 * value: { image: 镜像名, tags: 推荐tag[], desc: 简要说明 }
 */
export const OfficialImages: Record<
  string,
  {
    image: string
    tags: string[]
    desc?: string
  }
> = {
  // AI
  ollama: {
    image: 'ollama/ollama',
    tags: ['latest'],
    desc: 'AI LLM 服务'
  },

  // Web服务器
  apache: {
    image: 'httpd',
    tags: ['latest', '2.4'],
    desc: 'Apache HTTP Server'
  },
  nginx: {
    image: 'nginx',
    tags: ['latest', 'alpine', 'mainline'],
    desc: 'Nginx Web Server'
  },
  caddy: {
    image: 'caddy',
    tags: ['latest'],
    desc: 'Caddy Web Server'
  },
  tomcat: {
    image: 'tomcat',
    tags: ['latest', '10', '9'],
    desc: 'Apache Tomcat'
  },
  consul: {
    image: 'consul',
    tags: ['latest'],
    desc: 'Consul 服务发现'
  },

  // 数据库
  mysql: {
    image: 'mysql',
    tags: ['latest', '8.0', '5.7'],
    desc: 'MySQL 数据库'
  },
  mariadb: {
    image: 'mariadb',
    tags: ['latest', '11', '10.11'],
    desc: 'MariaDB 数据库'
  },
  postgresql: {
    image: 'postgres',
    tags: ['latest', '16', '15'],
    desc: 'PostgreSQL 数据库'
  },
  mongodb: {
    image: 'mongo',
    tags: ['latest', '7', '6'],
    desc: 'MongoDB 数据库'
  },

  // 邮件服务器
  mailpit: {
    image: 'axllent/mailpit',
    tags: ['latest'],
    desc: 'Mailpit 邮件测试'
  },

  // 编程语言 & 运行时
  php: {
    image: 'php',
    tags: ['latest', '8.2', '8.1', '7.4'],
    desc: 'PHP 运行环境'
  },
  composer: {
    image: 'composer',
    tags: ['latest'],
    desc: 'PHP Composer'
  },
  java: {
    image: 'openjdk',
    tags: ['latest', '21', '17', '8'],
    desc: 'OpenJDK Java'
  },
  maven: {
    image: 'maven',
    tags: ['latest', '3.9'],
    desc: 'Maven Java 构建'
  },
  node: {
    image: 'node',
    tags: ['latest', '20', '18', 'alpine'],
    desc: 'Node.js'
  },
  python: {
    image: 'python',
    tags: ['latest', '3.12', '3.11'],
    desc: 'Python'
  },
  golang: {
    image: 'golang',
    tags: ['latest', '1.22', '1.21'],
    desc: 'Go'
  },
  erlang: {
    image: 'erlang',
    tags: ['latest'],
    desc: 'Erlang'
  },
  ruby: {
    image: 'ruby',
    tags: ['latest', '3.3', '3.2'],
    desc: 'Ruby'
  },
  rust: {
    image: 'rust',
    tags: ['latest', '1.77'],
    desc: 'Rust'
  },
  bun: {
    image: 'oven/bun',
    tags: ['latest'],
    desc: 'Bun JS 运行时'
  },
  deno: {
    image: 'denoland/deno',
    tags: ['latest'],
    desc: 'Deno JS/TS 运行时'
  },
  gradle: {
    image: 'gradle',
    tags: ['latest', '8.7'],
    desc: 'Gradle 构建工具'
  },

  // 数据队列与缓存
  redis: {
    image: 'redis',
    tags: ['latest', '7', '6'],
    desc: 'Redis 缓存'
  },
  memcached: {
    image: 'memcached',
    tags: ['latest'],
    desc: 'Memcached 缓存'
  },
  rabbitmq: {
    image: 'rabbitmq',
    tags: ['latest', 'management'],
    desc: 'RabbitMQ 队列'
  },
  etcd: {
    image: 'quay.io/coreos/etcd',
    tags: ['latest', 'v3.5.13'],
    desc: 'etcd 分布式键值存储'
  },

  // 搜索引擎
  elasticsearch: {
    image: 'elasticsearch',
    tags: ['latest', '8.13.0', '7.17.0'],
    desc: 'Elasticsearch 搜索'
  },
  meilisearch: {
    image: 'getmeili/meilisearch',
    tags: ['latest', 'v1.8'],
    desc: 'Meilisearch 搜索'
  },
  typesense: {
    image: 'typesense/typesense',
    tags: ['latest', '0.25.2'],
    desc: 'Typesense 搜索'
  },

  // 对象存储
  minio: {
    image: 'minio/minio',
    tags: ['latest'],
    desc: 'Minio 对象存储'
  }
}
