import aiIT from './ai.json'
import apacheIT from './apache.json'
import appLogIT from './appLog.json'
import asideIT from './aside.json'
import baseIT from './base.json'
import confIT from './conf.json'
import feedbackIT from './feedback.json'
import forkIT from './fork.json'
import hostIT from './host.json'
import mailpitIT from './mailpit.json'
import menuIT from './menu.json'
import mysqlIT from './mysql.json'
import nginxIT from './nginx.json'
import nodejsIT from './nodejs.json'
import ollamaIT from './ollama.json'
import phpIT from './php.json'
import promptIT from './prompt.json'
import redisIT from './redis.json'
import serviceIT from './service.json'
import setupIT from './setup.json'
import tokenGeneratorIT from './token-generator.json'
import toolsIT from './tools.json'
import toolTypeIT from './toolType.json'
import trayIT from './tray.json'
import updateIT from './update.json'
import utilIT from './util.json'
import versionmanagerIT from './versionmanager.json'
import licensesIT from './licenses.json'
import requestTimer from './requestTimer.json'
import meilisearch from './meilisearch.json'
import minio from './minio.json'
import podman from './podman.json'

export default {
  it: {
    podman,
    minio,
    meilisearch,
    requestTimer,
    licenses: licensesIT,
    ai: aiIT,
    apache: apacheIT,
    appLog: appLogIT,
    aside: asideIT,
    base: baseIT,
    conf: confIT,
    feedback: feedbackIT,
    fork: forkIT,
    host: hostIT,
    mailpit: mailpitIT,
    menu: menuIT,
    mysql: mysqlIT,
    nginx: nginxIT,
    nodejs: nodejsIT,
    ollama: ollamaIT,
    php: phpIT,
    prompt: promptIT,
    redis: redisIT,
    service: serviceIT,
    setup: setupIT,
    'token-generator': tokenGeneratorIT,
    tools: toolsIT,
    toolType: toolTypeIT,
    tray: trayIT,
    update: updateIT,
    util: utilIT,
    versionmanager: versionmanagerIT
  }
}
