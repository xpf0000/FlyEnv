import path from 'node:path'

export type ModuleSpec = Readonly<{ name: string; asset: string }>

export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')

export const MODULES: readonly ModuleSpec[] = [
  { name: 'Nginx', asset: 'src/render/svg/nginx.svg' },
  { name: 'Apache', asset: 'src/render/svg/apache.svg' },
  { name: 'Caddy', asset: 'src/render/svg/caddy.svg' },
  { name: 'PHP', asset: 'src/render/svg/php.svg' },
  { name: 'Node.js', asset: 'src/render/svg/nodejs.svg' },
  { name: 'Python', asset: 'src/render/svg/python.svg' },
  { name: 'Java', asset: 'src/render/svg/java.svg' },
  { name: 'Go', asset: 'src/render/svg/Golang.svg' },
  { name: 'Ruby', asset: 'src/render/svg/Ruby.svg' },
  { name: 'Rust', asset: 'src/render/svg/rust.svg' },
  { name: 'MySQL', asset: 'src/render/svg/mysql.svg' },
  { name: 'MariaDB', asset: 'src/render/svg/mariaDB.svg' },
  { name: 'PostgreSQL', asset: 'src/render/svg/postgresql.svg' },
  { name: 'MongoDB', asset: 'src/render/svg/Mongodb.svg' },
  { name: 'Redis', asset: 'src/render/svg/redis.svg' },
  { name: 'Memcached', asset: 'src/render/svg/memcached.svg' },
  { name: 'RabbitMQ', asset: 'src/render/svg/rabbitmq.svg' },
  { name: 'Elasticsearch', asset: 'src/render/svg/elasticsearch.svg' },
  { name: 'MinIO', asset: 'src/render/svg/minio.svg' },
  { name: 'Tomcat', asset: 'src/render/svg/Tomcat.svg' },
  { name: 'Bun', asset: 'src/render/svg/bun.svg' },
  { name: 'Deno', asset: 'src/render/svg/deno.svg' },
  { name: 'Ollama', asset: 'src/render/svg/ollama.svg' },
  { name: 'Podman', asset: 'src/render/svg/podman.svg' }
]

export function partitionModules(items: readonly ModuleSpec[]): ModuleSpec[][] {
  return [items.slice(0, 8), items.slice(8, 16), items.slice(16, 24)]
}
