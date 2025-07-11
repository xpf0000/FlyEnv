<template>
  <div class="host-edit tools tools-system-env">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('util.toolSystemEnv') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
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
    </el-scrollbar>
  </div>
</template>

<script lang="ts" setup>
  import { ref, Ref } from 'vue'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { I18nT } from '@lang/index'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { shell, fs } from '@/util/NodeFn'

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
  const toEdit = async (file: string) => {
    const exists = await fs.existsSync(file)
    if (!exists) {
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
</script>
