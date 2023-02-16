<template>
  <el-button :loading="running" :disabled="running" @click="doFix">
    {{ $t('base.tryToFix') }}
  </el-button>
</template>

<script>
  import IPC from '@/util/IPC.ts'
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
            this.$message.success(this.$t('base.success'))
          } else {
            this.$message.error(this.$t('base.fail'))
          }
          this.running = false
        })
      }
    }
  }
</script>
