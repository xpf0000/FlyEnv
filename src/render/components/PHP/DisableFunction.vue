<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3 title"
            >{{ I18nT('php.disableFunction.title') }} - {{ version.version }} -
            {{ version.path }}</span
          >
        </div>
        <div class="flex items-center">
          <el-button type="primary" @click.stop="showPHPIni">php.ini</el-button>
          <el-button type="primary" @click.stop="doSave">{{ I18nT('base.save') }}</el-button>
        </div>
      </div>

      <div class="main-wapper p-3">
        <el-card class="app-base-el-card">
          <template #header>
            <div class="card-header flex items-center justify-between">
              <div class="left">
                <el-input
                  v-model.trim="search"
                  :placeholder="I18nT('base.placeholderSearch')"
                  clearable
                ></el-input>
              </div>
              <el-button type="primary" link :icon="Plus" @click="addFunction"> </el-button>
            </div>
          </template>
          <el-checkbox-group v-model="disableFunction" class="h-full overflow-hidden">
            <el-table height="100%" :data="tableData" style="width: 100%">
              <el-table-column prop="name" :label="I18nT('php.disableFunction.function')">
              </el-table-column>
              <el-table-column align="center" :label="I18nT('base.status')">
                <template #default="scope">
                  <el-checkbox :value="scope.row.name"></el-checkbox>
                </template>
              </el-table-column>
              <el-table-column width="150" align="center" :label="I18nT('base.action')">
                <template #default="scope">
                  <div class="flex items-center justify-center">
                    <el-button
                      link
                      type="primary"
                      :icon="Edit"
                      @click.stop="editFunction(scope.row.name)"
                    ></el-button>
                    <el-button
                      link
                      type="danger"
                      :icon="Delete"
                      @click.stop="delFunction(scope.row.name)"
                    ></el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </el-checkbox-group>
        </el-card>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, reactive, ref } from 'vue'
  import { AsyncComponentSetup, AsyncComponentShow } from '@/util/AsyncComponent'
  import { SoftInstalled } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import { Delete, Edit, Plus } from '@element-plus/icons-vue'
  import { ConfStore } from '@/components/Conf/setup'
  import IPC from '@/util/IPC'
  import localForage from 'localforage'
  import { fs } from '@/util/NodeFn'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { IniParse } from '@/util/IniParse'
  import { ElMessageBox } from 'element-plus'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const search = ref<string>('')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const storeKey = 'app-php-disablefunctions'

  /**
   * 初始化禁用函数 - 包含常见的 PHP 禁用函数
   */
  const initFunctions: string[] = [
    'exec',
    'system',
    'passthru',
    'shell_exec',
    'proc_open',
    'popen',
    'pcntl_exec',
    'pcntl_alarm',
    'pcntl_fork',
    'pcntl_waitpid',
    'pcntl_wait',
    'pcntl_wifexited',
    'pcntl_wifstopped',
    'pcntl_wifsignaled',
    'pcntl_wifcontinued',
    'pcntl_wexitstatus',
    'pcntl_wtermsig',
    'pcntl_wstopsig',
    'pcntl_signal',
    'pcntl_signal_get_handler',
    'pcntl_signal_dispatch',
    'pcntl_get_last_error',
    'pcntl_strerror',
    'pcntl_sigprocmask',
    'pcntl_sigwaitinfo',
    'pcntl_sigtimedwait',
    'pcntl_getpriority',
    'pcntl_setpriority',
    'pcntl_async_signals',
    'pcntl_unshare',
    'eval',
    'assert',
    'create_function',
    'chmod',
    'chown',
    'chgrp',
    'link',
    'symlink',
    'ini_alter',
    'dl',
    'show_source',
    'highlight_file',
    'phpinfo',
    'getmyuid',
    'getmypid',
    'getmygid',
    'getmyinode',
    'get_current_user',
    'getrusage',
    'posix_getpwuid',
    'posix_getgrgid',
    'posix_getgroups',
    'posix_geteuid',
    'posix_getegid',
    'posix_getgid',
    'posix_getuid',
    'posix_kill',
    'posix_mkfifo',
    'posix_setpgid',
    'posix_setsid',
    'posix_setuid',
    'posix_setgid',
    'posix_uname',
    'putenv',
    'proc_get_status',
    'proc_nice',
    'proc_terminate',
    'escapeshellcmd',
    'escapeshellarg',
    'disk_total_space',
    'disk_free_space',
    'diskfreespace',
    'tempnam',
    'tmpfile',
    'pfsockopen',
    'fsockopen',
    'ftp_connect',
    'ftp_login',
    'ftp_pasv',
    'ftp_exec',
    'ftp_raw',
    'ftp_rawlist',
    'ftp_nb_fput',
    'ftp_nb_put',
    'ftp_nb_continue',
    'ftp_get',
    'ftp_fget',
    'ftp_put',
    'ftp_fput',
    'ftp_delete',
    'ftp_rename',
    'ftp_chmod',
    'ftp_mkdir',
    'ftp_rmdir',
    'ftp_size',
    'ftp_mdtm',
    'ftp_systype',
    'mail',
    'openlog',
    'syslog',
    'closelog',
    'define_syslog_variables',
    'apache_child_terminate',
    'apache_get_modules',
    'apache_get_version',
    'apache_getenv',
    'apache_lookup_uri',
    'apache_note',
    'apache_request_headers',
    'apache_reset_timeout',
    'apache_response_headers',
    'apache_setenv',
    'virtual',
    'curl_multi_exec',
    'curl_exec',
    'parse_ini_file',
    'set_time_limit',
    'ignore_user_abort',
    'debug_backtrace',
    'debug_print_backtrace',
    'gc_collect_cycles',
    'gc_disable',
    'gc_enable',
    'gc_enabled',
    'gc_mem_caches',
    'gc_status',
    'get_defined_constants',
    'get_defined_functions',
    'get_defined_vars',
    'get_included_files',
    'get_loaded_extensions',
    'get_required_files',
    'get_resource_type',
    'get_resources',
    'getenv',
    'gethostbyaddr',
    'gethostbyname',
    'gethostbynamel',
    'gethostname',
    'getopt',
    'getprotobyname',
    'getprotobynumber',
    'getservbyname',
    'getservbyport',
    'header_remove',
    'header_register_callback',
    'headers_list',
    'headers_sent',
    'hex2bin',
    'highlight_string',
    'hrtime',
    'http_build_query',
    'http_response_code',
    'inet_ntop',
    'inet_pton',
    'ip2long',
    'long2ip',
    'md5_file',
    'md5',
    'sha1_file',
    'sha1',
    'sleep',
    'usleep',
    'time_nanosleep',
    'time_sleep_until',
    'uniqid',
    'unpack',
    'vsprintf',
    'wordwrap'
  ]

  const allFunctinos = ref<string[]>(initFunctions)

  localForage
    .getItem(storeKey)
    .then((res: any) => {
      if (res) {
        allFunctinos.value = res
      }
    })
    .catch()

  /**
   * 编辑禁用函数
   * 使用 ElMessageBox.prompt 设置
   */
  const editFunction = (name: string) => {
    const index = allFunctinos.value.indexOf(name)
    if (index === -1) {
      return
    }

    ElMessageBox.prompt(I18nT('php.disableFunction.title'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      inputValue: name,
      inputPlaceholder: I18nT('php.disableFunction.title'),
      beforeClose: async (action, instance, done) => {
        if (action === 'confirm') {
          const newName = instance.inputValue?.trim()

          if (!newName) {
            instance.editorErrorMessage = I18nT('php.disableFunction.emptyFunction')
            return
          }

          if (newName === name) {
            done()
            return
          }

          // 检查函数名是否已存在
          if (allFunctinos.value.some((func) => func === newName)) {
            instance.editorErrorMessage = I18nT('php.disableFunction.sameName')
            return
          }

          // 验证函数名格式（只允许字母、数字、下划线）
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
            instance.editorErrorMessage = I18nT('php.disableFunction.invalidName')
            return
          }

          // 更新函数名
          allFunctinos.value[index] = newName

          // 保存到本地存储
          try {
            await localForage.setItem(storeKey, JSON.parse(JSON.stringify(allFunctinos.value)))
            MessageSuccess(I18nT('base.success'))
          } catch (error) {
            MessageError(`${error}`)
            // 回滚更改
            allFunctinos.value[index] = name
          }
        }
        done()
      }
    }).catch()
  }

  /**
   * 删除禁用函数
   * 使用 ElMessageBox.confirm 确认
   */
  const delFunction = (name: string) => {
    const index = allFunctinos.value.indexOf(name)
    if (index === -1) {
      return
    }

    ElMessageBox.confirm(I18nT('base.delAlertContent', { name }), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning',
      distinguishCancelAndClose: true,
      beforeClose: async (action, instance, done) => {
        if (action === 'confirm') {
          // 从数组中移除
          const list = allFunctinos.value.filter((func) => func !== name)

          // 保存到本地存储
          try {
            await localForage.setItem(storeKey, JSON.parse(JSON.stringify(list)))
            MessageSuccess(I18nT('base.success'))
            allFunctinos.value = reactive(list)
          } catch (error) {
            MessageError(`${error}`)
          }
        }
        done()
      }
    }).catch()
  }

  /**
   * 添加禁用函数
   * 使用 ElMessageBox.prompt 设置
   * 使用 localForage 保存
   */
  const addFunction = () => {
    ElMessageBox.prompt(I18nT('php.disableFunction.title'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      inputPlaceholder: I18nT('php.disableFunction.title'),
      beforeClose: async (action, instance, done) => {
        if (action === 'confirm') {
          const newName = instance.inputValue?.trim()

          if (!newName) {
            instance.editorErrorMessage = I18nT('php.disableFunction.emptyFunction')
            return
          }

          // 检查函数名是否已存在
          if (allFunctinos.value.some((func) => func === newName)) {
            instance.editorErrorMessage = I18nT('php.disableFunction.sameName')
            return
          }

          // 验证函数名格式（只允许字母、数字、下划线）
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
            instance.editorErrorMessage = I18nT('php.disableFunction.invalidName')
            return
          }
          const list = [...allFunctinos.value]
          // 添加新函数
          list.unshift(newName)

          // 保存到本地存储
          try {
            await localForage.setItem(storeKey, JSON.parse(JSON.stringify(list)))
            MessageSuccess(I18nT('base.success'))
            allFunctinos.value = reactive(list)
          } catch (error) {
            MessageError(`${error}`)
          }
        }
        done()
      }
    }).catch()
  }

  /**
   * 表格显示数据
   */
  const tableData = computed(() => {
    const notList = allFunctinos.value.filter((f) => !disableFunction.value.includes(f))
    const list = [...disableFunction.value, ...notList]
    const key = search.value.trim().toLowerCase()
    if (key) {
      return list
        .filter((f) => {
          const fl = f.toLowerCase()
          return fl.includes(key) || key.includes(fl)
        })
        .map((m: string) => {
          return {
            name: m
          }
        })
    }
    return list.map((m: string) => {
      return {
        name: m
      }
    })
  })

  const flag = computed(() => {
    return props?.version?.phpBin ?? props?.version?.path
  })

  const file = computed(() => {
    if (ConfStore.phpIniFiles?.[flag?.value]) {
      return ConfStore.phpIniFiles?.[flag?.value]
    }
    return ''
  })

  const iniFile = ref('')
  const disableFunction = ref<string[]>([])

  let ConfVM: any
  import('./Config.vue').then((res) => {
    ConfVM = res.default
  })

  const showPHPIni = () => {
    AsyncComponentShow(ConfVM, {
      version: props.version
    }).then()
  }

  const doSave = async () => {
    if (!iniFile.value) {
      return
    }
    try {
      const content = await fs.readFile(iniFile.value)
      const parse = new IniParse(content)
      const functions = disableFunction.value.join(',')
      const value = `disable_functions = ${functions}`
      parse.set('disable_functions', value, 'PHP')
      await fs.writeFile(iniFile.value, parse.content)
      MessageSuccess(I18nT('base.success'))
    } catch (e) {
      MessageError(`${e}`)
    }
  }

  const fetchDisableFunctions = () => {
    IPC.send(
      'app-fork:php',
      'disableFunctionGet',
      JSON.parse(JSON.stringify(props.version)),
      file.value
    ).then((key: string, res: any) => {
      console.log(res)
      IPC.off(key)
      if (res.code === 0 && res?.data?.iniFile) {
        ConfStore.phpIniFiles[flag.value] = res?.data?.iniFile
        ConfStore.save()
        iniFile.value = res?.data?.iniFile
        disableFunction.value = res?.data?.list ?? []
        return
      }
    })
  }

  fetchDisableFunctions()

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
