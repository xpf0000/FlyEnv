<template>
  <el-input
    v-if="show"
    v-model="password"
    type="text"
    placeholder="Please input password"
    readonly
  />
  <el-input
    v-else
    v-model="password"
    type="password"
    placeholder="Please input password"
    readonly
  />
  <el-button-group>
    <el-button @click="show = !show">
      <yb-icon v-if="show" :svg="import('@/svg/eye.svg?raw')" :width="15" :height="15"></yb-icon>
      <yb-icon v-else :svg="import('@/svg/eye-slash.svg?raw')" :width="15" :height="15"></yb-icon>
    </el-button>
    <el-button @click="resetPassword">
      <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" :width="15" :height="15"></yb-icon>
    </el-button>
  </el-button-group>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { ElMessageBox } from 'element-plus'
  export default defineComponent({
    components: {},
    props: {},
    data() {
      return {
        show: false,
        password: ''
      }
    },
    computed: {},
    methods: {
      resetPassword() {
        ElMessageBox.prompt(this.$t('base.inputPassword'), {
          confirmButtonText: this.$t('base.confirm'),
          cancelButtonText: this.$t('base.cancel'),
          inputType: 'password',
          customClass: 'password-prompt',
          beforeClose: (action, instance, done) => {
            if (action === 'confirm') {
              // 去除trim, 有些电脑的密码是空格...
              if (instance.inputValue) {
                this.$message.success(this.$t('base.success'))
              }
            } else {
              done()
            }
          }
        })
          .then(() => {})
          .catch((err) => {
            console.log('err: ', err)
          })
      }
    }
  })
</script>
<style lang="scss">
  .password-prompt {
    background: #32364a !important;
    border: 1px solid #32364a !important;
    color: #fff !important;
    .el-message-box__message,
    .el-message-box__close {
      color: rgba(255, 255, 255, 0.7) !important;
    }
  }
</style>
