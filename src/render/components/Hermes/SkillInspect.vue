<template>
  <el-drawer
    v-model="show"
    :with-header="false"
    size="80%"
    :destroy-on-close="true"
    class="host-edit-drawer"
    :class="className"
    @closed="closedFn"
    @open="onOpen"
  >
    <div class="host-vhost">
      <div class="nav px-3 pr-5 overflow-hidden flex items-center">
        <div class="flex flex-s items-center gap-3">
          <yb-icon
            :svg="import('@/svg/delete.svg?raw')"
            class="w-[24px] h-[24px] p-[3px] cursor-pointer hover:text-yellow-500"
            @click="show = false"
          />
          <span class="truncate">{{ I18nT('common.action.preview') }}</span>
        </div>
      </div>

      <div class="flex-1 overflow-hidden">
        <el-scrollbar class="py-4">
          <div class="flex justify-center">
            <pre
              ref="pre"
              class="whitespace-pre-wrap break-words text-sm bg-gray-50 dark:bg-gray-900 p-4"
              >{{ content }}</pre
            >
          </div>
        </el-scrollbar>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import { ref } from 'vue'
  import { uuid } from '@/util/Index'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  defineProps<{
    content: string
  }>()

  const pre = ref<HTMLElement>()
  const className = ref(`skill-inspect-${uuid(8)}`)

  const onOpen = () => {
    const rect = pre.value?.getBoundingClientRect()
    if (rect) {
      const dom: HTMLElement = document.querySelector(`.${className.value}`) as HTMLElement
      if (dom) {
        dom.style.width = `${rect.width + 40}px`
      }
    }
    console.log(rect)
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
