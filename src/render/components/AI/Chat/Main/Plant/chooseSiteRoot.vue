<template>
  <div class="chat-plant-choosesiteroot">
    <div class="title"> 选择站点目录 </div>
    <div class="btns">
      <el-button type="primary" @click.stop="chooseDir()">选择文件夹</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { AIStore } from '@/components/AI/store'

  const { dialog } = require('@electron/remote')

  const aiStore = AIStore()
  const chooseDir = () => {
    let opt = ['openDirectory', 'createDirectory', 'showHiddenFiles']
    dialog
      .showOpenDialog({
        properties: opt
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        aiStore?.currentTask?.next(path)
      })
  }

  const toNext = () => {
    aiStore?.currentTask?.next(null)
  }
</script>

<style lang="scss">
  .chat-plant-choosesiteroot {
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
        width: 35%;
      }
    }
  }
</style>
