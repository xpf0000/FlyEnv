<template>
  <div class="chat-plant-siteaccesserror">
    <div class="title"> {{ $t('ai.错误类型') }} </div>
    <div class="btns">
      <el-button type="primary" @click.stop="send(403)">403</el-button>
      <el-button type="primary" @click.stop="send(404)">404</el-button>
      <el-button type="primary" @click.stop="send(502)">502</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { AIStore } from '@/components/AI/store'
  import { I18nT } from '@shared/lang'

  const aiStore = AIStore()
  const send = (code: 403 | 404 | 502) => {
    switch (code) {
      case 403:
        aiStore.chatList.push({
          user: 'ai',
          content: I18nT('ai.type403')
        })
        break
      case 404:
        aiStore.chatList.push({
          user: 'ai',
          content: I18nT('ai.type404')
        })
        break
      case 502:
        aiStore.chatList.push({
          user: 'ai',
          content: I18nT('ai.type502')
        })
        break
    }
  }
</script>

<style lang="scss">
  .chat-plant-siteaccesserror {
    width: 300px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #fff;
    color: #303133;
    border-radius: 5px;

    > .title {
      width: 100%;
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
    }

    > .btns {
      width: 100%;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-around;
      padding: 12px;

      > .el-button {
        width: 26%;
      }
    }
  }
</style>
