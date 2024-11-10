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
  import { MessageSuccess } from '@/util/Element'
  import { I18nT } from '@shared/lang'
  import { waitTime } from '@web/fn'

  const props = defineProps<{
    item: SoftInstalled
  }>()

  const store = Store

  const itemKey = props.item.bin

  const state = computed(() => {
    return store.state?.[itemKey]?.pgvector
  })

  const fetchLastedTag = () => {}

  const onShow = () => {
    console.log('onShow !!!')
    if (!store.state[itemKey]) {
      let state: 'noinstalled' | 'installed' | 'installing' = 'noinstalled'
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
    waitTime().then(() => {
      store.state[itemKey].pgvector = 'installed'
      MessageSuccess(I18nT('base.success'))
    })
  }
</script>
