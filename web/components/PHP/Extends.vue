<template>
  <el-drawer
    v-model="show"
    size="80%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <div class="php-extensions">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15">{{ I18nT('php.phpExtension') }}</span>
        </div>
        <el-button
          type="primary"
          class="shrink0"
          :disabled="!installExtensionDir"
          @click="openDir"
          >{{ I18nT('base.open') }}</el-button
        >
      </div>
      <div class="main-wapper">
        <el-card>
          <template #header>
            <div class="card-header">
              <div class="left">
                <span> {{ headerTitle }} </span>
                <template v-if="!extendRunning">
                  <el-select
                    v-model="lib"
                    :disabled="brewRunning || !version?.version"
                    class="lib-select w-52"
                  >
                    <template v-if="isHomeBrew">
                      <el-option value="homebrew" label="Homebrew"></el-option>
                    </template>
                    <template v-else-if="isMacPorts">
                      <el-option value="macports" label="Macports"></el-option>
                    </template>
                    <el-option
                      value="phpwebstudy"
                      :label="I18nT('php.extensionsLibDefault')"
                    ></el-option>
                  </el-select>
                </template>
              </div>
              <el-button v-if="showNextBtn" type="primary" @click="toNext">{{
                I18nT('base.confirm')
              }}</el-button>
              <el-button
                v-else
                class="button"
                :disabled="extendRefreshing || extendRunning"
                link
                @click="getTableData"
              >
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  class="refresh-icon"
                  :class="{ 'fa-spin': extendRefreshing || extendRunning }"
                ></yb-icon>
              </el-button>
            </div>
          </template>
          <div v-if="currentExtend" ref="logRef" class="logs cli-to-html">
            {{ logs?.join('') ?? '' }}
          </div>
          <el-table
            v-else
            v-loading="extendRefreshing"
            height="100%"
            :data="showTableDataFilter"
            style="width: 100%"
          >
            <el-table-column prop="name" class-name="name-cell-td" :label="I18nT('base.name')">
              <template #header>
                <div class="w-p100 name-cell">
                  <span style="display: inline-flex; padding: 2px 0">{{ I18nT('base.name') }}</span>
                  <el-input v-model.trim="search" placeholder="search" clearable></el-input>
                </div>
              </template>
              <template #default="scope">
                <div style="padding: 2px 0 2px 24px">{{ scope.row.name }}</div>
              </template>
            </el-table-column>
            <el-table-column align="center" :label="I18nT('base.status')">
              <template #default="scope">
                <div class="cell-status">
                  <yb-icon
                    v-if="scope.row.status"
                    :svg="import('@/svg/ok.svg?raw')"
                    class="installed"
                  ></yb-icon>
                </div>
              </template>
            </el-table-column>

            <el-table-column
              width="150px"
              align="left"
              :label="I18nT('base.operation')"
              class-name="operation"
            >
              <template v-if="version?.version" #default="scope">
                <template v-if="scope.row.status">
                  <el-popover :show-after="600" placement="top" width="auto">
                    <template #default>
                      <span>{{ I18nT('base.copyLink') }}</span>
                    </template>
                    <template #reference>
                      <el-button
                        type="primary"
                        link
                        :icon="Link"
                        @click="copyLink(scope.$index, scope.row)"
                      ></el-button>
                    </template>
                  </el-popover>
                  <template v-if="scope.row.name === 'xdebug'">
                    <el-popover :show-after="600" placement="top" width="auto">
                      <template #default>
                        <span>{{ I18nT('php.copyConfTemplate') }}</span>
                      </template>
                      <template #reference>
                        <el-button
                          type="primary"
                          link
                          :icon="Document"
                          @click="copyXDebugTmpl(scope.$index, scope.row)"
                        ></el-button>
                      </template>
                    </el-popover>
                  </template>
                  <el-popover :show-after="600" placement="top" width="auto">
                    <template #default>
                      <span>{{ I18nT('base.del') }}</span>
                    </template>
                    <template #reference>
                      <el-button
                        type="primary"
                        link
                        :icon="Delete"
                        @click="doDel(scope.$index, scope.row)"
                      ></el-button>
                    </template>
                  </el-popover>
                </template>
                <template v-else>
                  <el-popover :show-after="600" placement="top" width="auto">
                    <template #default>
                      <span>{{ I18nT('base.install') }}</span>
                    </template>
                    <template #reference>
                      <el-button
                        :disabled="brewRunning || !version?.version"
                        type="primary"
                        link
                        :icon="Download"
                        @click="handleEdit(scope.$index, scope.row)"
                      ></el-button>
                    </template>
                  </el-popover>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref, computed, watch, nextTick, Ref } from 'vue'
  import { reloadService, waitTime } from '@web/fn'
  import { BrewStore, SoftInstalled } from '@web/store/brew'
  import { TaskStore } from '@web/store/task'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@web/fn'
  import { ExtensionHomeBrew, ExtensionMacPorts } from '@web/components/PHP/store'
  import { MessageSuccess } from '@/util/Element'
  import { Document, Download, Link, Delete } from '@element-plus/icons-vue'
  import { ElMessageBox } from 'element-plus'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const search = ref('')
  const logRef = ref()
  const lib: Ref<'phpwebstudy' | 'macports' | 'homebrew'> = ref('phpwebstudy')
  const installExtensionDir = ref('')
  const showNextBtn = ref(false)
  const tableData = [
    {
      name: 'ionCube',
      installed: false,
      status: false,
      soname: 'ioncube.so',
      extendPre: 'zend_extension='
    },
    {
      name: 'sg11',
      installed: false,
      status: false,
      soname: 'ixed.dar'
    },
    {
      name: 'memcache',
      installed: false,
      status: false,
      soname: 'memcache.so'
    },
    {
      name: 'memcached',
      installed: false,
      status: false,
      soname: 'memcached.so'
    },
    {
      name: 'redis',
      installed: false,
      status: false,
      soname: 'redis.so'
    },
    {
      name: 'swoole',
      installed: false,
      status: false,
      soname: 'swoole.so'
    },
    {
      name: 'xdebug',
      installed: false,
      status: false,
      soname: 'xdebug.so',
      extendPre: 'zend_extension='
    },
    {
      name: 'xlswriter',
      installed: false,
      status: false,
      soname: 'xlswriter.so',
      extendPre: 'zend_extension='
    },
    {
      name: 'ssh2',
      installed: false,
      status: false,
      soname: 'ssh2.so'
    },
    {
      name: 'pdo_sqlsrv',
      installed: false,
      status: false,
      soname: 'pdo_sqlsrv.so'
    },
    {
      name: 'imagick',
      installed: false,
      status: false,
      soname: 'imagick.so'
    },
    {
      name: 'mongodb',
      installed: false,
      status: false,
      soname: 'mongodb.so'
    },
    {
      name: 'yaf',
      installed: false,
      status: false,
      soname: 'yaf.so'
    }
  ]
  const showTableData = ref({
    phpwebstudy: [],
    macports: [],
    homebrew: []
  })

  const showTableDataFilter = computed(() => {
    const sortName = (a: any, b: any) => {
      return a.name - b.name
    }
    const sortStatus = (a: any, b: any) => {
      if (a.status === b.status) {
        return 0
      }
      if (a.status) {
        return -1
      }
      if (b.status) {
        return 1
      }
      return 0
    }
    if (!search.value) {
      console.log('showTableData.value: ', showTableData.value, lib.value)
      return Array.from(showTableData.value?.[lib.value]).sort(sortName).sort(sortStatus)
    }
    return showTableData.value?.[lib.value]
      .filter((d: any) => d.name.toLowerCase().includes(search.value.toLowerCase()))
      .sort(sortName)
      .sort(sortStatus)
  })

  const brewStore = BrewStore()
  const taskStore = TaskStore()
  const brewRunning = computed(() => {
    return brewStore.brewRunning
  })
  const taskPhp = computed(() => {
    return taskStore.php!
  })
  const serverRunning = computed(() => {
    return props?.version?.run
  })
  const logs = computed(() => {
    return taskPhp.value.log!
  })
  const extendRunning = computed(() => {
    return taskPhp?.value?.extendRunning
  })
  const currentExtend = computed(() => {
    return taskPhp?.value?.currentExtend
  })
  const extendAction = computed(() => {
    return taskPhp?.value?.extendAction
  })
  const extendRefreshing = computed(() => {
    return taskPhp?.value?.extendRefreshing
  })
  const headerTitle = computed(() => {
    if (currentExtend?.value) {
      return `${extendAction?.value} ${currentExtend?.value}`
    } else if (props?.version?.version) {
      if (isHomeBrew?.value || isMacPorts?.value) {
        return I18nT('php.extensionsLib')
      }
      return I18nT('php.availableExtensions')
    } else {
      return I18nT('base.selectPhpVersion')
    }
  })
  const versionNumber = computed(() => {
    if (props?.version?.version) {
      let versionNums: any = props?.version?.version.split('.')
      versionNums.splice(2)
      return versionNums.join('.')
    }
    return 0
  })
  const logLength = computed(() => {
    return logs.value.length
  })

  const isMacPorts = computed(() => {
    return props.version?.flag === 'macports'
  })
  const isHomeBrew = computed(() => {
    return props.version?.path?.includes(global?.Server?.BrewCellar ?? '-----')
  })

  if (isMacPorts.value) {
    lib.value = 'macports'
  } else if (isHomeBrew.value) {
    lib.value = 'homebrew'
  }

  const openDir = () => {}

  const checkStatus = () => {
    if (props?.version?.version) {
      installExtensionDir.value = 'xxxxx'
      let k: 'phpwebstudy' | 'macports' | 'homebrew'
      for (k in showTableData.value) {
        showTableData.value[k].forEach((item: any) => {
          item.installed = true
          item.status = item.installed
          item.soPath = item.soname
        })
      }
      taskStore.php!.extendRefreshing = false
    }
  }

  const fetchAll = (fn: 'fetchAllPhpExtensions' | 'fetchAllPhpExtensionsByPort') => {
    return new Promise((resolve) => {
      if (fn === 'fetchAllPhpExtensions' && ExtensionHomeBrew?.[versionNumber.value]) {
        showTableData.value = ExtensionHomeBrew?.[versionNumber.value]
        resolve(true)
        return
      }
      if (fn === 'fetchAllPhpExtensionsByPort' && ExtensionMacPorts?.[versionNumber.value]) {
        showTableData.value = ExtensionMacPorts?.[versionNumber.value]
        resolve(true)
        return
      }
      if (fn === 'fetchAllPhpExtensions') {
        ExtensionHomeBrew[versionNumber.value] = [
          {
            name: 'amqp',
            libName: 'shivammathur/extensions/amqp@8.2',
            installed: false,
            status: false,
            soname: 'amqp.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/amqp.so'
          },
          {
            name: 'apcu',
            libName: 'shivammathur/extensions/apcu@8.2',
            installed: false,
            status: false,
            soname: 'apcu.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/apcu.so'
          },
          {
            name: 'ast',
            libName: 'shivammathur/extensions/ast@8.2',
            installed: false,
            status: false,
            soname: 'ast.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/ast.so'
          },
          {
            name: 'couchbase',
            libName: 'shivammathur/extensions/couchbase@8.2',
            installed: false,
            status: false,
            soname: 'couchbase.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/couchbase.so'
          },
          {
            name: 'ds',
            libName: 'shivammathur/extensions/ds@8.2',
            installed: false,
            status: false,
            soname: 'ds.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/ds.so'
          },
          {
            name: 'event',
            libName: 'shivammathur/extensions/event@8.2',
            installed: false,
            status: false,
            soname: 'event.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/event.so'
          },
          {
            name: 'expect',
            libName: 'shivammathur/extensions/expect@8.2',
            installed: false,
            status: false,
            soname: 'expect.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/expect.so'
          },
          {
            name: 'gearman',
            libName: 'shivammathur/extensions/gearman@8.2',
            installed: false,
            status: false,
            soname: 'gearman.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/gearman.so'
          },
          {
            name: 'gnupg',
            libName: 'shivammathur/extensions/gnupg@8.2',
            installed: false,
            status: false,
            soname: 'gnupg.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/gnupg.so'
          },
          {
            name: 'grpc',
            libName: 'shivammathur/extensions/grpc@8.2',
            installed: false,
            status: false,
            soname: 'grpc.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/grpc.so'
          },
          {
            name: 'igbinary',
            libName: 'shivammathur/extensions/igbinary@8.2',
            installed: false,
            status: false,
            soname: 'igbinary.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/igbinary.so'
          },
          {
            name: 'imagick',
            libName: 'shivammathur/extensions/imagick@8.2',
            installed: false,
            status: false,
            soname: 'imagick.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/imagick.so'
          },
          {
            name: 'imap',
            libName: 'shivammathur/extensions/imap@8.2',
            installed: false,
            status: false,
            soname: 'imap.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/imap.so'
          },
          {
            name: 'mailparse',
            libName: 'shivammathur/extensions/mailparse@8.2',
            installed: false,
            status: false,
            soname: 'mailparse.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/mailparse.so'
          },
          {
            name: 'mcrypt',
            libName: 'shivammathur/extensions/mcrypt@8.2',
            installed: false,
            status: false,
            soname: 'mcrypt.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/mcrypt.so'
          },
          {
            name: 'memcache',
            libName: 'shivammathur/extensions/memcache@8.2',
            installed: false,
            status: false,
            soname: 'memcache.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/memcache.so'
          },
          {
            name: 'memcached',
            libName: 'shivammathur/extensions/memcached@8.2',
            installed: true,
            status: true,
            soname: 'memcached.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/memcached.so'
          },
          {
            name: 'mongodb',
            libName: 'shivammathur/extensions/mongodb@8.2',
            installed: false,
            status: false,
            soname: 'mongodb.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/mongodb.so'
          },
          {
            name: 'msgpack',
            libName: 'shivammathur/extensions/msgpack@8.2',
            installed: false,
            status: false,
            soname: 'msgpack.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/msgpack.so'
          },
          {
            name: 'pcov',
            libName: 'shivammathur/extensions/pcov@8.2',
            installed: false,
            status: false,
            soname: 'pcov.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/pcov.so'
          },
          {
            name: 'pdo_sqlsrv',
            libName: 'shivammathur/extensions/pdo_sqlsrv@8.2',
            installed: false,
            status: false,
            soname: 'pdo_sqlsrv.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/pdo_sqlsrv.so'
          },
          {
            name: 'pecl_http',
            libName: 'shivammathur/extensions/pecl_http@8.2',
            installed: false,
            status: false,
            soname: 'http.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/http.so'
          },
          {
            name: 'phalcon5',
            libName: 'shivammathur/extensions/phalcon5@8.2',
            installed: false,
            status: false,
            soname: 'phalcon.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/phalcon.so'
          },
          {
            name: 'protobuf',
            libName: 'shivammathur/extensions/protobuf@8.2',
            installed: false,
            status: false,
            soname: 'protobuf.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/protobuf.so'
          },
          {
            name: 'psr',
            libName: 'shivammathur/extensions/psr@8.2',
            installed: false,
            status: false,
            soname: 'psr.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/psr.so'
          },
          {
            name: 'raphf',
            libName: 'shivammathur/extensions/raphf@8.2',
            installed: false,
            status: false,
            soname: 'raphf.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/raphf.so'
          },
          {
            name: 'rdkafka',
            libName: 'shivammathur/extensions/rdkafka@8.2',
            installed: false,
            status: false,
            soname: 'rdkafka.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/rdkafka.so'
          },
          {
            name: 'redis',
            libName: 'shivammathur/extensions/redis@8.2',
            installed: true,
            status: true,
            soname: 'redis.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/redis.so'
          },
          {
            name: 'snmp',
            libName: 'shivammathur/extensions/snmp@8.2',
            installed: false,
            status: false,
            soname: 'snmp.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/snmp.so'
          },
          {
            name: 'sqlsrv',
            libName: 'shivammathur/extensions/sqlsrv@8.2',
            installed: false,
            status: false,
            soname: 'sqlsrv.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/sqlsrv.so'
          },
          {
            name: 'ssh2',
            libName: 'shivammathur/extensions/ssh2@8.2',
            installed: false,
            status: false,
            soname: 'ssh2.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/ssh2.so'
          },
          {
            name: 'swoole',
            libName: 'shivammathur/extensions/swoole@8.2',
            installed: false,
            status: false,
            soname: 'swoole.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/swoole.so'
          },
          {
            name: 'uuid',
            libName: 'shivammathur/extensions/uuid@8.2',
            installed: false,
            status: false,
            soname: 'uuid.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/uuid.so'
          },
          {
            name: 'v8js',
            libName: 'shivammathur/extensions/v8js@8.2',
            installed: false,
            status: false,
            soname: 'v8js.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/v8js.so'
          },
          {
            name: 'vips',
            libName: 'shivammathur/extensions/vips@8.2',
            installed: false,
            status: false,
            soname: 'vips.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/vips.so'
          },
          {
            name: 'xdebug',
            libName: 'shivammathur/extensions/xdebug@8.2',
            installed: false,
            status: false,
            soname: 'xdebug.so',
            flag: 'homebrew',
            extendPre: 'zend_extension=',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/xdebug.so'
          },
          {
            name: 'xlswriter',
            libName: 'shivammathur/extensions/xlswriter@8.2',
            installed: true,
            status: true,
            soname: 'xlswriter.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/xlswriter.so'
          },
          {
            name: 'yaml',
            libName: 'shivammathur/extensions/yaml@8.2',
            installed: false,
            status: false,
            soname: 'yaml.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/yaml.so'
          },
          {
            name: 'zmq',
            libName: 'shivammathur/extensions/zmq@8.2',
            installed: false,
            status: false,
            soname: 'zmq.so',
            flag: 'homebrew',
            soPath: '/usr/local/Cellar/php/8.2.12_1/pecl/20220829/zmq.so'
          }
        ]
        showTableData.value = ExtensionHomeBrew?.[versionNumber.value]
      } else {
        ExtensionMacPorts[versionNumber.value] = [
          {
            name: 'amqp',
            libName: 'php81-amqp',
            installed: false,
            status: false,
            soname: 'amqp.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/amqp.so'
          },
          {
            name: 'apcu',
            libName: 'php81-APCu',
            installed: false,
            status: false,
            soname: 'apcu.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/apcu.so'
          },
          {
            name: 'calendar',
            libName: 'php81-calendar',
            installed: false,
            status: false,
            soname: 'calendar.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/calendar.so'
          },
          {
            name: 'curl',
            libName: 'php81-curl',
            installed: false,
            status: false,
            soname: 'curl.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/curl.so'
          },
          {
            name: 'dba',
            libName: 'php81-dba',
            installed: false,
            status: false,
            soname: 'dba.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/dba.so'
          },
          {
            name: 'dbase',
            libName: 'php81-dbase',
            installed: false,
            status: false,
            soname: 'dbase.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/dbase.so'
          },
          {
            name: 'enchant',
            libName: 'php81-enchant',
            installed: false,
            status: false,
            soname: 'enchant.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/enchant.so'
          },
          {
            name: 'event',
            libName: 'php81-event',
            installed: false,
            status: false,
            soname: 'event.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/event.so'
          },
          {
            name: 'exif',
            libName: 'php81-exif',
            installed: false,
            status: false,
            soname: 'exif.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/exif.so'
          },
          {
            name: 'ffi',
            libName: 'php81-ffi',
            installed: false,
            status: false,
            soname: 'ffi.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/ffi.so'
          },
          {
            name: 'ftp',
            libName: 'php81-ftp',
            installed: false,
            status: false,
            soname: 'ftp.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/ftp.so'
          },
          {
            name: 'gd',
            libName: 'php81-gd',
            installed: false,
            status: false,
            soname: 'gd.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/gd.so'
          },
          {
            name: 'gearman',
            libName: 'php81-gearman',
            installed: false,
            status: false,
            soname: 'gearman.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/gearman.so'
          },
          {
            name: 'geoip',
            libName: 'php81-geoip',
            installed: false,
            status: false,
            soname: 'geoip.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/geoip.so'
          },
          {
            name: 'gettext',
            libName: 'php81-gettext',
            installed: false,
            status: false,
            soname: 'gettext.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/gettext.so'
          },
          {
            name: 'gmagick',
            libName: 'php81-gmagick',
            installed: false,
            status: false,
            soname: 'gmagick.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/gmagick.so'
          },
          {
            name: 'gmp',
            libName: 'php81-gmp',
            installed: false,
            status: false,
            soname: 'gmp.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/gmp.so'
          },
          {
            name: 'iconv',
            libName: 'php81-iconv',
            installed: false,
            status: false,
            soname: 'iconv.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/iconv.so'
          },
          {
            name: 'igbinary',
            libName: 'php81-igbinary',
            installed: false,
            status: false,
            soname: 'igbinary.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/igbinary.so'
          },
          {
            name: 'imagick',
            libName: 'php81-imagick',
            installed: false,
            status: false,
            soname: 'imagick.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/imagick.so'
          },
          {
            name: 'imap',
            libName: 'php81-imap',
            installed: false,
            status: false,
            soname: 'imap.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/imap.so'
          },
          {
            name: 'intl',
            libName: 'php81-intl',
            installed: false,
            status: false,
            soname: 'intl.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/intl.so'
          },
          {
            name: 'ipc',
            libName: 'php81-ipc',
            installed: false,
            status: false,
            soname: 'ipc.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/ipc.so'
          },
          {
            name: 'jsmin',
            libName: 'php81-jsmin',
            installed: false,
            status: false,
            soname: 'jsmin.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/jsmin.so'
          },
          {
            name: 'ldap',
            libName: 'php81-ldap',
            installed: false,
            status: false,
            soname: 'ldap.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/ldap.so'
          },
          {
            name: 'lzf',
            libName: 'php81-lzf',
            installed: false,
            status: false,
            soname: 'lzf.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/lzf.so'
          },
          {
            name: 'mailparse',
            libName: 'php81-mailparse',
            installed: false,
            status: false,
            soname: 'mailparse.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/mailparse.so'
          },
          {
            name: 'maxminddb',
            libName: 'php81-maxminddb',
            installed: false,
            status: false,
            soname: 'maxminddb.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/maxminddb.so'
          },
          {
            name: 'mbstring',
            libName: 'php81-mbstring',
            installed: false,
            status: false,
            soname: 'mbstring.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/mbstring.so'
          },
          {
            name: 'mcrypt',
            libName: 'php81-mcrypt',
            installed: false,
            status: false,
            soname: 'mcrypt.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/mcrypt.so'
          },
          {
            name: 'memcache',
            libName: 'php81-memcache',
            installed: true,
            status: true,
            soname: 'memcache.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/memcache.so'
          },
          {
            name: 'memcached',
            libName: 'php81-memcached',
            installed: false,
            status: false,
            soname: 'memcached.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/memcached.so'
          },
          {
            name: 'meminfo',
            libName: 'php81-meminfo',
            installed: false,
            status: false,
            soname: 'meminfo.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/meminfo.so'
          },
          {
            name: 'mongodb',
            libName: 'php81-mongodb',
            installed: false,
            status: false,
            soname: 'mongodb.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/mongodb.so'
          },
          {
            name: 'mysql',
            libName: 'php81-mysql',
            installed: false,
            status: false,
            soname: 'mysqli.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/mysqli.so'
          },
          {
            name: 'mysql_xdevapi',
            libName: 'php81-mysql_xdevapi',
            installed: false,
            status: false,
            soname: 'mysql_xdevapi.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/mysql_xdevapi.so'
          },
          {
            name: 'oauth',
            libName: 'php81-oauth',
            installed: false,
            status: false,
            soname: 'oauth.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/oauth.so'
          },
          {
            name: 'odbc',
            libName: 'php81-odbc',
            installed: false,
            status: false,
            soname: 'odbc.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/odbc.so'
          },
          {
            name: 'opcache',
            libName: 'php81-opcache',
            installed: false,
            status: false,
            soname: 'opcache.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/opcache.so'
          },
          {
            name: 'openssl',
            libName: 'php81-openssl',
            installed: false,
            status: false,
            soname: 'openssl.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/openssl.so'
          },
          {
            name: 'openswoole',
            libName: 'php81-openswoole',
            installed: false,
            status: false,
            soname: 'openswoole.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/openswoole.so'
          },
          {
            name: 'oracle',
            libName: 'php81-oracle',
            installed: false,
            status: false,
            soname: 'oracle.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/oracle.so'
          },
          {
            name: 'pcntl',
            libName: 'php81-pcntl',
            installed: false,
            status: false,
            soname: 'pcntl.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/pcntl.so'
          },
          {
            name: 'pcov',
            libName: 'php81-pcov',
            installed: false,
            status: false,
            soname: 'pcov.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/pcov.so'
          },
          {
            name: 'posix',
            libName: 'php81-posix',
            installed: false,
            status: false,
            soname: 'posix.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/posix.so'
          },
          {
            name: 'postgresql',
            libName: 'php81-postgresql',
            installed: false,
            status: false,
            soname: 'pgsql.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/pgsql.so'
          },
          {
            name: 'pspell',
            libName: 'php81-pspell',
            installed: false,
            status: false,
            soname: 'pspell.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/pspell.so'
          },
          {
            name: 'psr',
            libName: 'php81-psr',
            installed: false,
            status: false,
            soname: 'psr.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/psr.so'
          },
          {
            name: 'raphf',
            libName: 'php81-raphf',
            installed: false,
            status: false,
            soname: 'raphf.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/raphf.so'
          },
          {
            name: 'rar',
            libName: 'php81-rar',
            installed: false,
            status: false,
            soname: 'rar.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/rar.so'
          },
          {
            name: 'redis',
            libName: 'php81-redis',
            installed: true,
            status: true,
            soname: 'redis.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/redis.so'
          },
          {
            name: 'rrd',
            libName: 'php81-rrd',
            installed: false,
            status: false,
            soname: 'rrd.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/rrd.so'
          },
          {
            name: 'scrypt',
            libName: 'php81-scrypt',
            installed: false,
            status: false,
            soname: 'scrypt.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/scrypt.so'
          },
          {
            name: 'snmp',
            libName: 'php81-snmp',
            installed: false,
            status: false,
            soname: 'snmp.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/snmp.so'
          },
          {
            name: 'soap',
            libName: 'php81-soap',
            installed: false,
            status: false,
            soname: 'soap.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/soap.so'
          },
          {
            name: 'sockets',
            libName: 'php81-sockets',
            installed: false,
            status: false,
            soname: 'sockets.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/sockets.so'
          },
          {
            name: 'sodium',
            libName: 'php81-sodium',
            installed: false,
            status: false,
            soname: 'sodium.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/sodium.so'
          },
          {
            name: 'solr',
            libName: 'php81-solr',
            installed: false,
            status: false,
            soname: 'solr.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/solr.so'
          },
          {
            name: 'sqlite',
            libName: 'php81-sqlite',
            installed: false,
            status: false,
            soname: 'sqlite.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/sqlite.so'
          },
          {
            name: 'sqlsrv',
            libName: 'php81-sqlsrv',
            installed: false,
            status: false,
            soname: 'sqlsrv.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/sqlsrv.so'
          },
          {
            name: 'ssh2',
            libName: 'php81-ssh2',
            installed: true,
            status: true,
            soname: 'ssh2.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/ssh2.so'
          },
          {
            name: 'stomp',
            libName: 'php81-stomp',
            installed: false,
            status: false,
            soname: 'stomp.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/stomp.so'
          },
          {
            name: 'svm',
            libName: 'php81-svm',
            installed: false,
            status: false,
            soname: 'svm.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/svm.so'
          },
          {
            name: 'swoole',
            libName: 'php81-swoole',
            installed: true,
            status: true,
            soname: 'swoole.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/swoole.so'
          },
          {
            name: 'tideways_xhprof',
            libName: 'php81-tideways_xhprof',
            installed: false,
            status: false,
            soname: 'xhprof.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/xhprof.so'
          },
          {
            name: 'tidy',
            libName: 'php81-tidy',
            installed: false,
            status: false,
            soname: 'tidy.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/tidy.so'
          },
          {
            name: 'timezonedb',
            libName: 'php81-timezonedb',
            installed: false,
            status: false,
            soname: 'timezonedb.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/timezonedb.so'
          },
          {
            name: 'uploadprogress',
            libName: 'php81-uploadprogress',
            installed: false,
            status: false,
            soname: 'uploadprogress.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/uploadprogress.so'
          },
          {
            name: 'uuid',
            libName: 'php81-uuid',
            installed: false,
            status: false,
            soname: 'uuid.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/uuid.so'
          },
          {
            name: 'vld',
            libName: 'php81-vld',
            installed: false,
            status: false,
            soname: 'vld.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/vld.so'
          },
          {
            name: 'xapian',
            libName: 'php81-xapian',
            installed: false,
            status: false,
            soname: 'xapian.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/xapian.so'
          },
          {
            name: 'xdebug',
            libName: 'php81-xdebug',
            installed: true,
            status: true,
            soname: 'xdebug.so',
            flag: 'macports',
            extendPre: 'zend_extension=',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/xdebug.so'
          },
          {
            name: 'xmlrpc',
            libName: 'php81-xmlrpc',
            installed: false,
            status: false,
            soname: 'xmlrpc.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/xmlrpc.so'
          },
          {
            name: 'xsl',
            libName: 'php81-xsl',
            installed: false,
            status: false,
            soname: 'xsl.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/xsl.so'
          },
          {
            name: 'yaf',
            libName: 'php81-yaf',
            installed: false,
            status: false,
            soname: 'yaf.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/yaf.so'
          },
          {
            name: 'yaml',
            libName: 'php81-yaml',
            installed: false,
            status: false,
            soname: 'yaml.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/yaml.so'
          },
          {
            name: 'yaz',
            libName: 'php81-yaz',
            installed: false,
            status: false,
            soname: 'yaz.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/yaz.so'
          },
          {
            name: 'zip',
            libName: 'php81-zip',
            installed: false,
            status: false,
            soname: 'zip.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/zip.so'
          },
          {
            name: 'zstd',
            libName: 'php81-zstd',
            installed: false,
            status: false,
            soname: 'zstd.so',
            flag: 'macports',
            soPath: '/opt/local/lib/php81/extensions/no-debug-non-zts-20210902/zstd.so'
          }
        ]
        showTableData.value = ExtensionMacPorts?.[versionNumber.value]
      }
      resolve(true)
    })
  }

  const getTableData = async () => {
    const currentLib = lib.value
    taskStore.php!.extendRefreshing = true
    if (currentLib === 'phpwebstudy') {
      showTableData.value.phpwebstudy = []
      showTableData.value.phpwebstudy = JSON.parse(JSON.stringify(tableData))
    } else if (currentLib === 'homebrew') {
      showTableData.value.homebrew = []
      await fetchAll('fetchAllPhpExtensions')
    } else if (currentLib === 'macports') {
      showTableData.value.macports = []
      await fetchAll('fetchAllPhpExtensionsByPort')
    }
    checkStatus()
  }

  const toNext = () => {
    showNextBtn.value = false
    taskStore.php!.currentExtend = ''
    taskStore.php!.extendAction = ''
  }

  const handleEdit = (index: number, row: any) => {
    console.log(index, row)
    if (extendRunning?.value || !props?.version?.version) {
      return
    }
    logs.value.splice(0)
    taskStore.php!.extendRunning = true
    taskStore.php!.currentExtend = row.name
    taskStore.php!.extendAction = row.status ? I18nT('base.uninstall') : I18nT('base.install')
    waitTime().then(() => {
      taskStore.php!.extendRunning = false
      if (serverRunning.value) {
        reloadService('php', props.version)
      }
      MessageSuccess(I18nT('base.success'))
      getTableData().then(() => {
        toNext()
      })
    })
  }

  const copyLink = (index: number, row: any) => {
    MessageSuccess(I18nT('php.extensionCopySuccess'))
  }

  const doDel = () => {
    ElMessageBox.confirm(I18nT('base.delAlertContent'), undefined, {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      closeOnClickModal: false,
      customClass: 'confirm-del',
      type: 'warning'
    }).then(() => {})
  }

  const copyXDebugTmpl = (index: number, row: any) => {
    MessageSuccess(I18nT('php.xdebugConfCopySuccess'))
  }

  watch(
    () => props?.version?.version,
    () => {
      taskStore.php!.extendRefreshing = false
      getTableData().then()
    },
    {
      immediate: true
    }
  )

  watch(lib, () => {
    taskStore.php!.extendRefreshing = false
    getTableData().then()
  })

  watch(logLength, () => {
    nextTick().then(() => {
      let container: HTMLElement = logRef.value as any
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
  })

  if (!taskPhp?.value?.extendRunning) {
    taskStore.php!.currentExtend = ''
    taskStore.php!.extendAction = ''
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
