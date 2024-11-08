<template>
  <div class="tool-decode host-edit">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
        <span class="ml-15">{{ I18nT('tool.codemake') }}</span>
      </div>
    </div>

    <div class="main-wapper">
      <div class="main min-h-full">
        <template v-if="!CodeMake.isConnent">
          <Connect />
        </template>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
  import { I18nT } from '@shared/lang'
  import Connect from './connect.vue'
  import { CodeMake } from './store'

  const emit = defineEmits(['doClose'])
  const doClose = () => {
    emit('doClose')
  }
</script>
