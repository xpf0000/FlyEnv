<template>
  <div v-if="MysqlClusterManager.blocked" class="soft-index-panel main-right-panel"
    ><el-alert :title="MysqlClusterManager.loadError" type="error" :closable="false"
  /></div>
  <div v-else class="soft-index-panel main-right-panel"
    ><el-radio-group v-model="tab" class="mt-3"
      ><el-radio-button v-for="(label, index) in tabs" :key="index" :value="index">{{
        t(label)
      }}</el-radio-button></el-radio-group
    ><div class="main-block"
      ><Instances v-if="tab === 0" /><Services v-else-if="tab === 1" /><Versions v-else /></div
  ></div>
</template>
<script setup lang="ts">
  import { ref } from 'vue'
  import Instances from './Instances.vue'
  import Services from './Services.vue'
  import Versions from './Versions.vue'
  import { MysqlClusterManager, registerLifecycle } from './manager'
  import { t } from './lang'
  const tabs = ['instances', 'services', 'versions'],
    tab = ref(0)
  if (registerLifecycle()) MysqlClusterManager.load().catch(() => undefined)
</script>
