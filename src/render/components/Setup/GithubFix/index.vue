<template>
  <div class="plant-title">{{ $t('base.githubFixTitle') }}</div>
  <div class="main brew-src">
    <el-button :loading="running" :disabled="running" @click="doFix">
      {{ $t('base.tryToFix') }}
    </el-button>
  </div>
</template>

<script>
  import IPC from '@/util/IPC.ts'
  import { MessageError, MessageSuccess } from '@/util/Element'
  export default {
    components: {},
    props: {},
    data() {
      return {
        running: false
      }
    },
    methods: {
      doFix() {
        this.running = true
        IPC.send('app-fork:host', 'githubFix').then((key, info) => {
          IPC.off(key)
          if (info.code === 0) {
            MessageSuccess(this.$t('base.success'))
          } else {
            MessageError(this.$t('base.fail'))
          }
          this.running = false
        })
      }
    }
  }
</script>
