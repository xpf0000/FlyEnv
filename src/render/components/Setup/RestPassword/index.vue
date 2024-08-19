<template>
  <div class="plant-title">{{ $t('base.resetPassword') }}</div>
  <div class="main reset-pass">
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
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import IPC from '@/util/IPC'
  import { ElMessageBox } from 'element-plus'
  import { AppStore } from '@/store/app'
  import { MessageSuccess } from '@/util/Element'
  export default defineComponent({
    components: {},
    props: {},
    data() {
      return {
        show: false
      }
    },
    computed: {
      password() {
        return AppStore().config.password
      }
    },
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
                IPC.send('app:password-check', instance.inputValue).then(
                  (key: string, res: any) => {
                    IPC.off(key)
                    if (res === false) {
                      instance.editorErrorMessage = this.$t('base.passwordError')
                    } else {
                      global.Server.Password = res
                      AppStore()
                        .initConfig()
                        .then(() => {
                          done && done()
                          MessageSuccess(this.$t('base.success'))
                        })
                    }
                  }
                )
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
