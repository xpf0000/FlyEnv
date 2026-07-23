<template>
  <div>
    <el-radio-group v-model="current" class="mb-3 ml-3">
      <el-radio-button value="config.xml">config.xml</el-radio-button>
      <el-radio-button value="users.xml">users.xml</el-radio-button>
    </el-radio-group>
    <Conf
      :key="file"
      ref="conf"
      :type-flag="'clickhouse'"
      :default-file="defaultFile"
      :file="file"
      :file-ext="'xml'"
      :config-language="'xml'"
      :show-commond="false"
    >
    </Conf>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { join } from '@/util/path-browserify'

  const current = ref('config.xml')
  const conf = ref()

  const file = computed(() => {
    return join(window.Server.ClickHouseDir!, current.value)
  })

  const defaultFile = computed(() => {
    return join(window.Server.ClickHouseDir!, `${current.value}.default`)
  })
</script>
