import axios, { type AxiosRequestConfig } from 'axios'
import { getAxiosProxy } from '../../util/Axios'

export function extensionHttpGet(url: string, config: AxiosRequestConfig = {}) {
  return axios.get(url, { ...config, proxy: getAxiosProxy() })
}

// PECL is used only for packages whose publisher corresponds to that PECL project.
const peclPackages: Record<string, string> = {
  'phpredis/phpredis': 'redis',
  'xdebug/xdebug': 'xdebug',
  'imagick/imagick': 'imagick',
  'mongodb/mongodb-extension': 'mongodb',
  'grpc/grpc-php-ext': 'grpc',
  'apcu/apcu': 'apcu',
  'igbinary/igbinary': 'igbinary',
  'php-ds/ext-ds': 'ds',
  'msgpack/msgpack-php': 'msgpack',
  'php-amqp/php-amqp': 'amqp',
  'rdkafka/rdkafka': 'rdkafka',
  'php-memcached/php-memcached': 'memcached',
  'nikic/php-ast': 'ast',
  'pecl/pcov': 'pcov',
  'pecl/yaml': 'yaml',
  'pecl/zip': 'zip',
  'm6w6/ext-raphf': 'raphf',
  'm6w6/ext-http': 'http'
}

export function isPeclPublisher(name: string, extension: string): boolean {
  return peclPackages[name] === extension
}
