import { reactive } from 'vue'
import Base from './Form/Base'
import PHP from './Form/PHP'
import Apache from './Form/Apache'
import MySQL from './Form/MySQL'
import MariaDB from './Form/MariaDB'
import Nginx from './Form/Nginx'
import Caddy from './Form/Caddy'
import Tomcat from './Form/Tomcat'
import Consul from './Form/Consul'
import NodeJS from './Form/NodeJS'
import Bun from './Form/Bun'
import Deno from './Form/Deno'
import Erlang from './Form/Erlang'
import Go from './Form/Go'
import Perl from './Form/Perl'
import Python from './Form/Python'
import Ruby from './Form/Ruby'
import Rust from './Form/Rust'
import Java from './Form/Java'
import MongoDB from './Form/MongoDB'
import PostgreSQL from './Form/PostgreSQL'
import Etcd from './Form/Etcd'
import Memcached from './Form/Memcached'
import RabbitMQ from './Form/RabbitMQ'
import Redis from './Form/Redis'
import Mailpit from './Form/Mailpit'
import Elasticsearch from './Form/Elasticsearch'
import Meilisearch from './Form/Meilisearch'
import MinIO from './Form/MinIO'

const ComposeBuildForm: Record<string, any> = reactive({
  base: Base,
  PHP,
  'Apache HTTP Server': Apache,
  MySQL,
  MariaDB,
  Nginx,
  Caddy,
  'Apache Tomcat': Tomcat,
  Consul,
  'Node.js': NodeJS,
  Bun,
  Deno,
  Erlang,
  'Go (Golang)': Go,
  Perl,
  Python,
  Ruby,
  Rust,
  Java,
  MongoDB,
  PostgreSQL,
  etcd: Etcd,
  Memcached,
  RabbitMQ,
  Redis,
  Mailpit,
  Elasticsearch,
  Meilisearch,
  MinIO
})

export { ComposeBuildForm }
