import aiUA from './ai.json'
import apacheUA from './apache.json'
import appLogUA from './appLog.json'
import asideUA from './aside.json'
import baseUA from './base.json'
import confUA from './conf.json'
import feedbackUA from './feedback.json'
import forkUA from './fork.json'
import hostUA from './host.json'
import mailpitUA from './mailpit.json'
import menuUA from './menu.json'
import mysqlUA from './mysql.json'
import nginxUA from './nginx.json'
import nodejsUA from './nodejs.json'
import ollamaUA from './ollama.json'
import phpUA from './php.json'
import promptUA from './prompt.json'
import redisUA from './redis.json'
import serviceUA from './service.json'
import setupUA from './setup.json'
import tokenGeneratorUA from './token-generator.json'
import toolsUA from './tools.json'
import toolTypeUA from './toolType.json'
import trayUA from './tray.json'
import updateUA from './update.json'
import utilUA from './util.json'
import versionmanagerUA from './versionmanager.json'
import licensesUA from './licenses.json'
import requestTimer from './requestTimer.json'
import meilisearch from './meilisearch.json'
import minio from './minio.json'
import podman from './podman.json'

export default {
  ua: {
    podman,
    minio,
    meilisearch,
    requestTimer,
    licenses: licensesUA,
    ai: aiUA,
    apache: apacheUA,
    appLog: appLogUA,
    aside: asideUA,
    base: baseUA,
    conf: confUA,
    feedback: feedbackUA,
    fork: forkUA,
    host: hostUA,
    mailpit: mailpitUA,
    menu: menuUA,
    mysql: mysqlUA,
    nginx: nginxUA,
    nodejs: nodejsUA,
    ollama: ollamaUA,
    php: phpUA,
    prompt: promptUA,
    redis: redisUA,
    service: serviceUA,
    setup: setupUA,
    'token-generator': tokenGeneratorUA,
    tools: toolsUA,
    toolType: toolTypeUA,
    tray: trayUA,
    update: updateUA,
    util: utilUA,
    versionmanager: versionmanagerUA
  }
}
