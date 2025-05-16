import aiID from './ai.json'
import apacheID from './apache.json'
import appLogID from './appLog.json'
import asideID from './aside.json'
import baseID from './base.json'
import confID from './conf.json'
import feedbackID from './feedback.json'
import forkID from './fork.json'
import hostID from './host.json'
import mailpitID from './mailpit.json'
import menuID from './menu.json'
import mysqlID from './mysql.json'
import nginxID from './nginx.json'
import nodejsID from './nodejs.json'
import ollamaID from './ollama.json'
import phpID from './php.json'
import promptID from './prompt.json'
import redisID from './redis.json'
import serviceID from './service.json'
import setupID from './setup.json'
import tokenGeneratorID from './token-generator.json'
import toolsID from './tools.json'
import toolTypeID from './toolType.json'
import trayID from './tray.json'
import updateID from './update.json'
import utilID from './util.json'
import versionmanagerID from './versionmanager.json'
import licensesID from './licenses.json'
import requestTimer from './requestTimer.json'
import meilisearch from './meilisearch.json'
import minio from './minio.json'

export default {
  id: {
    minio,
    meilisearch,
    requestTimer,
    licenses: licensesID,
    ai: aiID,
    apache: apacheID,
    appLog: appLogID,
    aside: asideID,
    base: baseID,
    conf: confID,
    feedback: feedbackID,
    fork: forkID,
    host: hostID,
    mailpit: mailpitID,
    menu: menuID,
    mysql: mysqlID,
    nginx: nginxID,
    nodejs: nodejsID,
    ollama: ollamaID,
    php: phpID,
    prompt: promptID,
    redis: redisID,
    service: serviceID,
    setup: setupID,
    'token-generator': tokenGeneratorID,
    tools: toolsID,
    toolType: toolTypeID,
    tray: trayID,
    update: updateID,
    util: utilID,
    versionmanager: versionmanagerID
  }
}
