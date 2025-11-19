import ai from './ai.json'
import apache from './apache.json'
import appLog from './appLog.json'
import aside from './aside.json'
import base from './base.json'
import conf from './conf.json'
import feedback from './feedback.json'
import fork from './fork.json'
import host from './host.json'
import mailpit from './mailpit.json'
import menu from './menu.json'
import mysql from './mysql.json'
import nginx from './nginx.json'
import nodejs from './nodejs.json'
import ollama from './ollama.json'
import php from './php.json'
import prompt from './prompt.json'
import redis from './redis.json'
import service from './service.json'
import setup from './setup.json'
import tokenGenerator from './token-generator.json'
import tools from './tools.json'
import toolType from './toolType.json'
import tray from './tray.json'
import update from './update.json'
import util from './util.json'
import versionmanager from './versionmanager.json'
import licenses from './licenses.json'
import requestTimer from './requestTimer.json'
import meilisearch from './meilisearch.json'
import minio from './minio.json'
import podman from './podman.json'

export default {
  cs: {
    podman,
    minio,
    meilisearch,
    requestTimer,
    licenses: licenses,
    ai: ai,
    apache: apache,
    appLog: appLog,
    aside: aside,
    base: base,
    conf: conf,
    feedback: feedback,
    fork: fork,
    host: host,
    mailpit: mailpit,
    menu: menu,
    mysql: mysql,
    nginx: nginx,
    nodejs: nodejs,
    ollama: ollama,
    php: php,
    prompt: prompt,
    redis: redis,
    service: service,
    setup: setup,
    'token-generator': tokenGenerator,
    tools: tools,
    toolType: toolType,
    tray: tray,
    update: update,
    util: util,
    versionmanager: versionmanager
  }
}
