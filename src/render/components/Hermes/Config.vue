<template>
  <div class="module-config">
    <el-card class="app-base-el-card h-full overflow-hidden">
      <template #header>
        <el-radio-group v-model="filepath">
          <template v-for="(item, _index) in configs" :key="_index">
            <el-radio-button :value="item.path" :label="item.name"></el-radio-button>
          </template>
        </el-radio-group>
      </template>
      <template #default>
        <ConfVM
          :key="filepath"
          ref="conf"
          class="h-full overflow-hidden"
          :type-flag="'hermes'"
          :show-load-default="false"
          :file="filepath"
          :file-ext="fileExt"
          :config-language="configLanguage"
          :show-commond="false"
        >
        </ConfVM>
      </template>
      <template #footer>
        <ToolVM v-if="conf" :conf="conf"></ToolVM>
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import ConfVM from '@/components/Conf/conf.vue'
  import ToolVM from '@/components/Conf/tool.vue'
  import { HermesSetup } from '@/components/Hermes/setup'

  const conf = ref()

  const configs = computed(() => {
    return Object.entries(HermesSetup.configPaths).map(([name, path]) => ({ name, path }))
  })

  const filepath = computed({
    get() {
      return HermesSetup.confTab
    },
    set(value) {
      HermesSetup.confTab = value
    }
  })

  watch(
    configs,
    (val) => {
      if (val.length > 0 && !filepath.value) {
        filepath.value = val[0].path
      }
    },
    { immediate: true }
  )

  const currentFile = computed(() => {
    return configs.value.find((c) => c.path === filepath.value)
  })

  const fileExt = computed(() => {
    const name = currentFile.value?.name ?? ''
    if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml'
    if (name === '.env') return 'env'
    if (name.endsWith('.md')) return 'md'
    return 'txt'
  })

  const configLanguage = computed(() => {
    const name = currentFile.value?.name ?? ''
    if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml'
    if (name === '.env') return 'ini'
    if (name.endsWith('.md')) return 'markdown'
    return 'plaintext'
  })
</script>
