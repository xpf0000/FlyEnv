<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="flex flex-col overflow-hidden h-screen gap-4">
      <el-radio-group v-model="filepath" class="mt-4 px-3 flex-shrink-0">
        <template v-for="(item, _index) in logs" :key="_index">
          <el-radio-button :value="item.path" :label="item.name"></el-radio-button>
        </template>
      </el-radio-group>
      <LogVM ref="log" :log-file="filepath" class="flex-1 overflow-hidden" />
      <ToolVM :log="log" class="flex-shrink-0 px-3 pb-4" />
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref, onMounted, computed, nextTick, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { fs } from '@/util/NodeFn'
  import type { ProjectItem } from '@/components/LanguageProjects/ProjectItem'
  import { join } from '@/util/path-browserify'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: ProjectItem
  }>()

  const log = ref()

  const logs = computed(() => {
    const baseDir = join(window.Server.BaseDir!, 'module-customer')
    const outFile = join(baseDir, `${props.item.id}-out.log`)
    const errFile = join(baseDir, `${props.item.id}-error.log`)
    return [
      {
        name: I18nT('base.log'),
        path: outFile
      },
      {
        name: I18nT('base.errorLog'),
        path: errFile
      },
      ...props.item.logPath
    ]
  })

  const filepath = ref(logs.value[0].path)

  const doRefresh = async () => {
    await nextTick()

    if (show.value && (await fs.existsSync(filepath.value))) {
      log.value?.logDo?.('refresh')
    }
  }

  watch(filepath, () => {
    doRefresh().catch()
  })

  onMounted(() => {
    doRefresh().catch()
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
