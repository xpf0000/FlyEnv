<template>
  <div class="plant-title">{{ $t('base.githubFixTitle') }}</div>
  <div class="main brew-src">
    <el-button :loading="running" :disabled="running" @click="doFix">
      {{ $t('base.tryToFix') }}
    </el-button>
  </div>
</template>

<script>
  import { MessageSuccess } from '@/util/Element'
  export default {
    components: {},
    props: {},
    data() {
      return {
        running: false
      }
    },
    methods: {
      async doFix() {
        this.running = true
        await waitTime()
        MessageSuccess(this.$t('base.success'))
      }
    }
  }
</script>
