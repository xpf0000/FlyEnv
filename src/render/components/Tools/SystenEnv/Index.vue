<template>
  <div class="host-edit tools tools-system-env">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('util.toolSystemEnv') }}</span>
      </div>
    </div>

    <div class="main-wapper">
      <template v-for="f in list" :key="f">
        <div class="file">
          <span @click.stop="openFile(f)">{{ f }}</span>
          <el-button link @click.stop="toEdit(f)">
            <yb-icon :svg="import('@/svg/edit.svg?raw')" width="18" height="18" />
          </el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref, Ref } from 'vue'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  const { shell } = require('@electron/remote')
  const { existsSync } = require('fs-extra')

  const emit = defineEmits(['doClose'])

  const list: Ref<string[]> = ref([])
  IPC.send('app-fork:tools', 'systemEnvFiles').then((key: string, res: any) => {
    IPC.off(key)
    console.log('res: ', res)
    list.value = res?.data ?? []
  })

  let EditVM: any
  import('./edit.vue').then((res) => {
    EditVM = res.default
  })
  const toEdit = (file: string) => {
    if (!existsSync(file)) {
      MessageError(I18nT('util.toolFileNotExist'))
      return
    }
    AsyncComponentShow(EditVM, {
      file
    }).then()
  }

  const openFile = (file: string) => {
    shell.showItemInFolder(file)
  }

  const doClose = () => {
    emit('doClose')
  }
</script>
