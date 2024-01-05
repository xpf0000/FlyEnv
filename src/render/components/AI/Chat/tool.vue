<template>
  <div class="app-ai-tool">
    <el-input
      ref="input"
      v-model="content"
      :autosize="{ minRows: 1, maxRows: 9 }"
      resize="none"
      type="textarea"
    ></el-input>
    <el-button round :icon="Folder"></el-button>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref, onBeforeUnmount } from 'vue'
  import { Folder } from '@element-plus/icons-vue'
  import { AIStore } from '@/components/AI/store'
  import { CreateSiteTest } from '@/components/AI/Task/CreateSiteTest'

  const input = ref()
  const content = ref('')
  const aiStore = AIStore()
  const keyEvent = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.altKey || e.ctrlKey || e.metaKey) {
        content.value += '\n'
      } else {
        e?.stopPropagation && e?.stopPropagation()
        e?.preventDefault && e?.preventDefault()
        const value = content.value.trim()
        if (value) {
          aiStore.chatList.push({
            user: 'user',
            content: value
          })
          content.value = ''
          if (value === '创建随机站点') {
            aiStore.currentTask = new CreateSiteTest()
            aiStore.currentTask.next()
          }
        }
      }
    }
  }

  onMounted(() => {
    const textarea: HTMLTextAreaElement = input?.value?.textarea as any
    textarea?.addEventListener('keydown', keyEvent)
  })
  onBeforeUnmount(() => {
    const textarea: HTMLTextAreaElement = input?.value?.textarea as any
    textarea?.removeEventListener('keydown', keyEvent)
  })
</script>

<style lang="scss">
  .app-ai-tool {
    display: flex;
    padding: 12px;
    align-items: flex-end;
    background: #32364a;
    flex-shrink: 0;

    > .el-input {
      flex: 1;
    }

    > .el-button {
      flex-shrink: 0;
      margin-left: 12px;
    }
  }
</style>
