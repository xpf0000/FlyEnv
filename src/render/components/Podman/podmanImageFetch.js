import axios from 'axios'
import * as fs from 'node:fs'
import { compareVersions } from 'compare-versions'

const OfficialImages = {
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
  jdk: {
    image: 'eclipse-temurin'
  }
}

const all = process.argv.slice(2).includes('all')

function isStableTag(tag, name) {
  if (name === 'tomcat') {
    const reg = /^\d{1,3}(\.\d{1,3}){2,2}-jdk\d{1,3}$/g
    return reg.test(tag)
  }
  if (name === 'postgres') {
    const reg = /^\d{1,3}(\.\d{1,3}){1,1}$/g
    return reg.test(tag)
  }
  if (name === 'axllent/mailpit') {
    const reg = /^v\d{1,3}(\.\d{1,3}){2,2}$/g
    return reg.test(tag)
  }
  if (name === 'openjdk') {
    const reg = /^\d{1,3}((\.\d{1,3}){2,2})?([_\.]\d+)?-jdk$/g
    return reg.test(tag)
  }
  if (name === 'erlang') {
    const reg = /^\d{1,3}(\.\d{1,3}){3,3}$/g
    return reg.test(tag)
  }
  if (name === 'quay.io/coreos/etcd') {
    const reg = /^v\d{1,3}(\.\d{1,3}){2,2}$/g
    return reg.test(tag)
  }
  if (name === 'getmeili/meilisearch') {
    const reg = /^v\d{1,3}(\.\d{1,3}){2,2}$/g
    return reg.test(tag)
  }
  if (name === 'typesense/typesense') {
    const reg = /^\d{1,3}(\.\d{1,3}){1,2}$/g
    return reg.test(tag)
  }
  if (name === 'eclipse-temurin') {
    if (tag.startsWith('8u') && tag.endsWith('-jdk')) {
      return true
    }
    const reg = /^\d{1,3}(\.\d{1,3}){2,2}[_.]\d+-jdk$/g
    return reg.test(tag)
  }
  if (name === 'minio/minio') {
    return false
  }
  const reg = /^\d{1,3}(\.\d{1,3}){2,2}$/g
  return reg.test(tag)
}

// 获取 Docker Hub 镜像 tag（分页）
async function fetchDockerHubTags(image) {
  let repo = image.includes('/') ? image : `library/${image}`
  let url = `https://hub.docker.com/v2/repositories/${repo}/tags/?page_size=100`
  let tags = []
  let next = url
  while (next) {
    try {
      const res = await axios.get(next)
      tags.push(
        ...res.data.results
          .map((item) => item.name)
          .filter((tag) => {
            return isStableTag(tag, image)
          })
      )
      next = all ? res.data.next : undefined
    } catch (e) {
      console.log('fetchTags error: ', image, e)
      break
    }
  }
  return tags
}

// 获取 Quay.io 镜像 tag（分页）
async function fetchQuayTags(image) {
  // image: quay.io/coreos/etcd
  const [, namespace, repo] = image.split('/')
  let url = `https://quay.io/api/v1/repository/${namespace}/${repo}/tag/?limit=100`
  let tags = []
  let nextPage = 1
  let hasMore = true
  while (hasMore) {
    try {
      const res = await axios.get(`${url}&page=${nextPage}`)
      tags.push(
        ...res.data.tags
          .map((item) => item.name)
          .filter((tag) => {
            return isStableTag(tag, image)
          })
      )
      hasMore = all ? res?.data?.has_more : false
      nextPage++
    } catch (e) {
      console.log('fetchQuayTags error: ', image, e)
      break
    }
  }
  return tags
}

async function fetchTags(image) {
  if (image.startsWith('quay.io/')) {
    return await fetchQuayTags(image)
  } else {
    return await fetchDockerHubTags(image)
  }
}

const map = (s) => {
  if (/^\d+$/.test(s)) {
    return s
  }
  if (s.startsWith('8u')) {
    const v = s.replace('-jdk', '').replace('b', '').replace('u', '.').replace('-', '.')
    return v
  }
  if (s.includes('-jdk') && !s.endsWith('-jdk')) {
    return s.replace('-jdk', '.')
  }
  let v = 0
  try {
    v = parseInt(s)
    if (isNaN(v)) {
      v = 0
    }
  } catch {}
  return `${v}`
}

async function fetchAllImagesTags() {
  const result = {}
  for (const key in OfficialImages) {
    const image = OfficialImages[key].image
    const tags = await fetchTags(image)
    result[image] = tags
    console.log(`Fetched ${image}: ${tags.length} tags`)
  }
  fs.writeFileSync('allImagesTags.raw.json', JSON.stringify(result, null, 2), 'utf-8')
  const file = 'allImagesTags.json'
  const content = fs.readFileSync(file, 'utf-8')
  const json = JSON.parse(content)
  for (const image in result) {
    if (!Object.prototype.hasOwnProperty.call(json, image)) {
      json[image] = result[image]
    } else {
      const oldArr = json[image]
      const newArr = result[image]
      json[image] = Array.from(new Set([...oldArr, ...newArr])).sort((a, b) => {
        const av = a.split('.').map(map).join('.')
        const bv = b.split('.').map(map).join('.')
        let r = 0
        try {
          r = compareVersions(bv, av)
        } catch (e) {
          console.log('compareVersions e: ', e, image, a, av, b, bv)
        }
        return r
      })
    }
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2), 'utf-8')
  console.log('All tags saved to allImagesTags.json')
}

fetchAllImagesTags().catch()
