import store from '@/store'
import CommandManager from './CommandManager'
import { Message } from 'element-ui'
import { I18n } from '@/components/Locale'

const commands = new CommandManager()

function updateSystemTheme (theme) {
  store.dispatch('app/updateSystemTheme', theme)
}

function updateTheme (theme) {
  store.dispatch('preference/changeThemeConfig', theme)
}

function reciveTaskLog (log) {
  store.dispatch('task/updateLog', log)
}

function taskResult (r) {
  if (r === 'SUCCESS') {
    Message.success(I18n.t('task.task-success'))
    commands.$EveBus.$emit('vue:task-versions-success')
  } else {
    Message.error(I18n.t('task.task-fail'))
  }
  store.dispatch('task/result', r)
}

function taskCallBack (data) {
  console.log(data)
  commands.$EveBus.$emit(`${data.module}-${data.action}`, data.res)
}

function taskEnd () {
  console.log('taskEnd !!!!!!!!!')
  store.dispatch('task/end')
}

function reciveTaskLogApache (log) {
  store.dispatch('apache/updateLog', log)
}
function taskEndApache () {
  store.dispatch('apache/end')
}
function taskResultApache (r) {
  if (r === 'SUCCESS') {
    Message.success(I18n.t('task.task-success'))
  } else {
    Message.error(I18n.t('task.task-fail'))
  }
  store.dispatch('apache/result', r)
}

function reciveTaskLogNginx (log) {
  store.dispatch('nginx/updateLog', log)
}
function taskEndNginx () {
  store.dispatch('nginx/end')
}
function taskResultNginx (r) {
  if (r === 'SUCCESS') {
    Message.success(I18n.t('task.task-success'))
  } else {
    Message.error(I18n.t('task.task-fail'))
  }
  store.dispatch('nginx/result', r)
}

function reciveTaskLogMysql (log) {
  store.dispatch('mysql/updateLog', log)
}
function taskEndMysql () {
  store.dispatch('mysql/end')
}
function taskResultMysql (r) {
  if (r === 'SUCCESS') {
    Message.success(I18n.t('task.task-success'))
  } else {
    Message.error(I18n.t('task.task-fail'))
  }
  store.dispatch('mysql/result', r)
}

function reciveTaskLogPhp (log) {
  store.dispatch('php/updateLog', log)
}
function taskEndPhp () {
  store.dispatch('php/end')
}
function taskResultPhp (r) {
  if (r === 'SUCCESS') {
    Message.success(I18n.t('task.task-success'))
  } else {
    Message.error(I18n.t('task.task-fail'))
  }
  store.dispatch('php/result', r)
}

function reciveTaskLogMemcached (log) {
  store.dispatch('memcached/updateLog', log)
}
function taskEndMemcached () {
  store.dispatch('memcached/end')
}
function taskResultMemcached (r) {
  if (r === 'SUCCESS') {
    Message.success(I18n.t('task.task-success'))
  } else {
    Message.error(I18n.t('task.task-fail'))
  }
  store.dispatch('memcached/result', r)
}

function reciveTaskLogRedis (log) {
  store.dispatch('redis/updateLog', log)
}
function taskEndRedis () {
  store.dispatch('redis/end')
}
function taskResultRedis (r) {
  if (r === 'SUCCESS') {
    Message.success(I18n.t('task.task-success'))
  } else {
    Message.error(I18n.t('task.task-fail'))
  }
  store.dispatch('redis/result', r)
}

function serverStat (stat) {
  console.log('@@@@@@ serverStat: ', stat)
  store.dispatch('app/updateServerStat', stat)
}

function phpExtendsStat (info) {
  console.log('phpExtendsStat: ', info)
  commands.$EveBus.$emit('vue:php-extends-stat', info)
}

function hostHandleAdd (res) {
  commands.$EveBus.$emit('vue:host-add-end', res)
}
function hostHandleDel (res) {
  commands.$EveBus.$emit('vue:host-del-end', res)
}
function hostHandleEdit (res) {
  commands.$EveBus.$emit('vue:host-edit-end', res)
}

function hostList (list) {
  store.dispatch('app/updateHosts', list)
}

function showAboutPanel () {
  store.dispatch('app/showAboutPanel')
}

function checkPassword (res) {
  console.log('checkPassword: ', res)
  commands.$EveBus.$emit('vue:check-password', res)
}

function needPassword () {
  commands.$EveBus.$emit('vue:need-password')
}

commands.register('application:about', showAboutPanel)
commands.register('application:system-theme', updateSystemTheme)
commands.register('application:theme', updateTheme)

commands.register('application:task-log', reciveTaskLog)
commands.register('application:task-end', taskEnd)
commands.register('application:task-result', taskResult)
commands.register('application:task-callback', taskCallBack)

commands.register('application:task-apache-log', reciveTaskLogApache)
commands.register('application:task-apache-end', taskEndApache)
commands.register('application:task-apache-result', taskResultApache)

commands.register('application:task-nginx-log', reciveTaskLogNginx)
commands.register('application:task-nginx-end', taskEndNginx)
commands.register('application:task-nginx-result', taskResultNginx)

commands.register('application:task-mysql-log', reciveTaskLogMysql)
commands.register('application:task-mysql-end', taskEndMysql)
commands.register('application:task-mysql-result', taskResultMysql)

commands.register('application:task-php-log', reciveTaskLogPhp)
commands.register('application:task-php-end', taskEndPhp)
commands.register('application:task-php-result', taskResultPhp)

commands.register('application:task-memcached-log', reciveTaskLogMemcached)
commands.register('application:task-memcached-end', taskEndMemcached)
commands.register('application:task-memcached-result', taskResultMemcached)

commands.register('application:task-redis-log', reciveTaskLogRedis)
commands.register('application:task-redis-end', taskEndRedis)
commands.register('application:task-redis-result', taskResultRedis)

commands.register('application:server-stat', serverStat)
commands.register('application:php-extends-stat', phpExtendsStat)
commands.register('application:host-add', hostHandleAdd)
commands.register('application:host-del', hostHandleDel)
commands.register('application:host-edit', hostHandleEdit)
commands.register('application:host-list', hostList)

commands.register('application:check-password', checkPassword)
commands.register('application:need-password', needPassword)

export {
  commands
}
