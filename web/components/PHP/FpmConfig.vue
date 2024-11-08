<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15 title">{{ item.version }} - {{ item.path }} - php-fpm.conf</span>
        </div>
      </div>

      <Conf
        ref="conf"
        :type-flag="'php'"
        :default-conf="defaultConf"
        :file="file"
        :file-ext="'ini'"
        :show-commond="false"
      >
      </Conf>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { SoftInstalled } from '@web/store/brew'
  import Conf from '@web/components/Conf/drawer.vue'

  const { existsSync, mkdirp, writeFile } = require('fs-extra')
  const { join, dirname } = require('path')

  const props = defineProps<{
    item: SoftInstalled
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const file = computed(() => {
    const num = props.item?.num ?? 0
    return join(global.Server.PhpDir!, `${num}/conf/php-fpm.conf`)
  })

  const defaultConf = computed(() => {
    return `[global]
pid = run/php-fpm.pid
error_log = log/php-fpm.log
log_level = notice
[www]
listen = /tmp/phpwebstudy-php-cgi-${props.item.num}.sock
listen.allowed_clients = 127.0.0.1
pm = dynamic
pm.max_children = 20
pm.start_servers = 2
pm.min_spare_servers = 2
pm.max_spare_servers = 10
request_slowlog_timeout = 30
slowlog = log/php-fpm-slow.log
`
  })

  const conf = ref()

  const init = async () => {
    if (!existsSync(file.value)) {
      const str = defaultConf.value
      await mkdirp(dirname(file.value))
      await writeFile(file.value, str)
      conf?.value?.update()
      return
    }
  }

  init().then().catch()

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
