<template>
  <el-popover
    effect="dark"
    popper-class="host-list-poper"
    placement="left-start"
    :show-arrow="false"
    width="auto"
    @before-enter="onShow"
  >
    <ul v-poper-fix class="host-list-menu">
      <li @click.stop="doInstallPgvector">
        <el-button
          :dark="true"
          :class="state"
          link
          :disabled="!state"
          :loading="state === 'installing'"
          :icon="Check"
          :type="state === 'installed' ? 'success' : ''"
        >
          <span>pgvector</span>
        </el-button>
      </li>
    </ul>
    <template #reference>
      <li>
        <yb-icon :svg="import('@/svg/extend.svg?raw')" width="13" height="13" />
        <span class="ml-15">{{ I18nT('php.extension') }}</span>
      </li>
    </template>
  </el-popover>
</template>
<script lang="ts" setup>
  import { computed, reactive } from 'vue'
  import { Check } from '@element-plus/icons-vue'
  import type { SoftInstalled } from '@web/store/brew'
  import { Store } from './store'
  import IPC from '@/util/IPC'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { I18nT } from '@shared/lang'

  const { existsSync } = require('fs')
  const { join } = require('path')

  const props = defineProps<{
    item: SoftInstalled
  }>()

  const store = Store

  const itemKey = props.item.bin

  const state = computed(() => {
    return store.state?.[itemKey]?.pgvector
  })

  let lastedTag = 'v0.7.4'

  const fetchLastedTag = () => {
    let saved: any = localStorage.getItem(`pgvector-lasted-tag`)
    if (saved) {
      saved = JSON.parse(saved)
      const time = Math.round(new Date().getTime() / 1000)
      if (time < saved.expire) {
        lastedTag = saved.data
        return
      }
    }
    IPC.send('app-fork:postgresql', 'fetchLastedTag').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        lastedTag = res.data
        localStorage.setItem(
          `pgvector-lasted-tag`,
          JSON.stringify({
            expire: Math.round(new Date().getTime() / 1000) + 24 * 60 * 60,
            data: lastedTag
          })
        )
      }
    })
  }

  const onShow = () => {
    console.log('onShow !!!')
    if (!store.state[itemKey]) {
      let state: 'noinstalled' | 'installed' | 'installing' = 'noinstalled'
      const num = props.item.version?.split('.').shift()
      const arr = [
        join(props.item.path, 'share/postgresql/extension/vector.control'),
        join(props.item.path, `share/postgresql@${num}/extension/vector.control`),
        join(props.item.path, `vector.dylib`),
        join(props.item.path, `vector.so`)
      ]
      console.log('arr: ', arr)
      const installed = arr.some((p) => existsSync(p))
      if (installed) {
        state = 'installed'
      }
      store.state[itemKey] = reactive({
        pgvector: state
      })
    }
    fetchLastedTag()
  }

  const doInstallPgvector = () => {
    if (state.value !== 'noinstalled') {
      return
    }
    store.state[itemKey].pgvector = 'installing'
    IPC.send(
      'app-fork:postgresql',
      'installPgvector',
      JSON.parse(JSON.stringify(props.item)),
      lastedTag
    ).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        store.state[itemKey].pgvector = 'installed'
        MessageSuccess(I18nT('base.success'))
        return
      }
      MessageError(res?.msg ?? 'Install Failed')
    })
  }
</script>
