<template>
  <div class="tool-decode host-edit">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
        <span class="ml-15">{{ $t('tool.codemake') }}</span>
      </div>
    </div>

    <div class="main-wapper">
      <div class="main">
        <el-button @click.stop="doConnent">connent</el-button>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
  import IPC from '@/util/IPC'

  const doConnent = () => {
    const data = {
      user: 'root',
      password: 'root'
    }
    IPC.send('app-fork:codemake', 'connent', data).then((key: string, res: any) => {
      IPC.off(key)
    })
  }
</script>
