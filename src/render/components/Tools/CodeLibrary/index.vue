<template>
  <div class="json-parse tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('tools.CodeLibrary') }}</span>
        <el-popover trigger="click" width="auto">
          <template #reference>
            <el-button link class="ml-3">
              <Setting class="w-[18px] h-[18px]"></Setting>
            </el-button>
          </template>
          <template #default>
            <div class="flex px-2 flex-col gap-3">
              <template v-for="(l, _i) in CodeLibrary.langs" :key="_i">
                <div class="flex justify-between items-center gap-8">
                  <span class="flex-shrink-0">{{ l.type }}</span>
                  <el-switch v-model="l.show" size="small"></el-switch>
                </div>
              </template>
            </div>
          </template>
        </el-popover>
        <slot name="like"></slot>
      </div>
    </div>

    <div ref="wapper" class="main-wapper overflow-hidden">
      <el-tabs v-model="tab" type="card" class="el-tabs-content-flex-1">
        <template v-for="(item, _key) in tabs" :key="_key">
          <el-tab-pane lazy :label="item.type" :name="item.type">
            <ContentVM :lang-type="item.type" />
          </el-tab-pane>
        </template>
      </el-tabs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, onBeforeUnmount, watch } from 'vue'
  import CodeLibrary from './setup'
  import { Setting } from '@element-plus/icons-vue'
  import ContentVM from './content.vue'
  import { unUseCopyCode, useCopyCode } from '@/util/markdown/copyCode'

  const wapper = ref()

  CodeLibrary.init()

  const tabs = computed(() => {
    return CodeLibrary.langs.filter((f) => f.show)
  })

  const tab = computed({
    get() {
      return CodeLibrary.langType
    },
    set(v: string) {
      CodeLibrary.langType = v
    }
  })

  watch(tab, () => {
    CodeLibrary.onLangChange()
  })

  onMounted(() => {
    useCopyCode(wapper.value)
  })

  onBeforeUnmount(() => {
    unUseCopyCode(wapper.value)
  })
</script>
