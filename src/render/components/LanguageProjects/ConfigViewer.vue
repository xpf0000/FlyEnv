<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="flex flex-col overflow-hidden h-screen host-vhost">
      <el-radio-group v-model="filepath" class="mt-4 flex-shrink-0 mb-4 px-3">
        <template v-for="(item, _index) in configs" :key="_index">
          <el-radio-button :value="item.path" :label="item.name"></el-radio-button>
        </template>
      </el-radio-group>
      <Conf
        ref="conf"
        :type-flag="item.typeFlag"
        :file="filepath"
        :file-ext="'ini'"
        :show-commond="false"
      >
      </Conf>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref, onMounted, computed, nextTick, watch } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { fs } from '@/util/NodeFn'
  import type { ProjectItem } from '@/components/LanguageProjects/ProjectItem'
  import Conf from '@/components/Conf/drawer.vue'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: ProjectItem
  }>()

  const conf = ref()

  const configs = computed(() => {
    return props.item.configPath
  })

  const filepath = ref(configs.value[0].path)

  const doRefresh = async () => {
    await nextTick()

    if (show.value && (await fs.existsSync(filepath.value))) {
      conf.value?.getConfig()
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
