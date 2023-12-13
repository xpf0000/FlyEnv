<template>
  <el-button :loading="running" :disabled="running" @click="doFix">
    {{ $t('base.tryToFix') }}
  </el-button>
</template>

<script>
  import { waitTime } from '../../../fn.ts'

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
        waitTime().then(() => {
          this.running = false
          this.$message.success(this.$t('base.success'))
        })
      }
    }
  }
</script>
