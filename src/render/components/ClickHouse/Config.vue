<template>
  <div class="module-config h-full overflow-hidden flex flex-col">
    <el-card class="app-base-el-card flex-1 overflow-hidden">
      <template #header>
        <el-radio-group v-model="current">
          <el-radio-button value="config.xml">config.xml</el-radio-button>
          <el-radio-button value="users.xml">users.xml</el-radio-button>
        </el-radio-group>
      </template>
      <template #default>
        <ConfVM
          v-if="ready"
          :key="file"
          ref="conf"
          class="h-full overflow-hidden"
          :type-flag="'clickhouse'"
          :default-file="defaultFile"
          :file="file"
          :file-ext="'xml'"
          :config-language="'xml'"
          :show-commond="false"
        />
      </template>
      <template #footer>
        <ToolVM v-if="conf" :conf="conf" />
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue'
  import ConfVM from '@/components/Conf/conf.vue'
  import ToolVM from '@/components/Conf/tool.vue'
  import IPC from '@/util/IPC'
  import { join } from '@/util/path-browserify'

  const current = ref('config.xml')
  const conf = ref()
  const ready = ref(false)

  const file = computed(() => {
    return join(window.Server.ClickHouseDir!, current.value)
  })

  const defaultFile = computed(() => {
    return join(window.Server.ClickHouseDir!, `${current.value}.default`)
  })

  onMounted(() => {
    IPC.send('app-fork:clickhouse', 'initConfig').then((key: string) => {
      IPC.off(key)
      ready.value = true
    })
  })
</script>
