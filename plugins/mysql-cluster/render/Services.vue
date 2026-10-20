<template>
  <Service
    type-flag="mysql"
    title="MySQL"
    :show-service-controls="false"
    :before-remove="beforeRemove"
  >
    <template #action="{ row }"
      ><li class="pointer-events-none"
        ><span class="ml-3"
          >{{ t('references') }}:
          {{
            manager.catalog.instances
              .filter((i) => i.engine.bin === row.bin)
              .map((i) => i.name)
              .join(', ') || '—'
          }}</span
        ></li
      ></template
    >
  </Service>
</template>
<script setup lang="ts">
  import Service from '@/components/ServiceManager/index.vue'
  import { MysqlClusterManager as manager } from './manager'
  import { beforeRemove } from './versionGuard'
  import { t } from './lang'
</script>
