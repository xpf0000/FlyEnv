import aiES from './ai.json'
import apacheES from './apache.json'
import appLogES from './appLog.json'
import asideES from './aside.json'
import baseES from './base.json'
import confES from './conf.json'
import feedbackES from './feedback.json'
import forkES from './fork.json'
import hostES from './host.json'
import mailpitES from './mailpit.json'
import menuES from './menu.json'
import mysqlES from './mysql.json'
import nginxES from './nginx.json'
import nodejsES from './nodejs.json'
import ollamaES from './ollama.json'
import phpES from './php.json'
import promptES from './prompt.json'
import redisES from './redis.json'
import serviceES from './service.json'
import setupES from './setup.json'
import tokenGeneratorES from './token-generator.json'
import toolsES from './tools.json'
import toolTypeES from './toolType.json'
import trayES from './tray.json'
import updateES from './update.json'
import utilES from './util.json'
import versionmanagerES from './versionmanager.json'
import licensesES from './licenses.json'
import requestTimer from './requestTimer.json'
import meilisearch from './meilisearch.json'
import minio from './minio.json'
import podman from './podman.json'

export default {
  es: {
    podman,
    minio,
    meilisearch,
    requestTimer,
    licenses: licensesES,
    ai: aiES,
    apache: apacheES,
    appLog: appLogES,
    aside: asideES,
    base: baseES,
    conf: confES,
    feedback: feedbackES,
    fork: forkES,
    host: hostES,
    mailpit: mailpitES,
    menu: menuES,
    mysql: mysqlES,
    nginx: nginxES,
    nodejs: nodejsES,
    ollama: ollamaES,
    php: phpES,
    prompt: promptES,
    redis: redisES,
    service: serviceES,
    setup: setupES,
    'token-generator': tokenGeneratorES,
    tools: toolsES,
    toolType: toolTypeES,
    tray: trayES,
    update: updateES,
    util: utilES,
    versionmanager: versionmanagerES
  }
}
