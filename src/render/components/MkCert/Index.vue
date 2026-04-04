<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Setup v-if="tab === 0"></Setup>
      <Certs v-else-if="tab === 1"></Certs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Setup from './Setup.vue'
  import Certs from './Certs.vue'
  import { I18nT } from '@lang/index'
  import { onMounted, ref } from 'vue'
  import MkCertStore from '@/core/MkCert/MkCertStore'

  const tab = ref(0)
  const tabs = [I18nT('base.setupBase'), I18nT('mkcert.certificates')]

  onMounted(() => {
    MkCertStore.init()
  })
</script>
