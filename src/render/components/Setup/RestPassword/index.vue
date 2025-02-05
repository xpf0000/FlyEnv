<template>
  <div class="plant-title flex items-center gap-1">
    <span>
      {{ $t('base.resetPassword') }}
    </span>
    <el-popover placement="top" width="auto">
      <template #reference>
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
      </template>
      <template #default>
        <span>{{ $t('setup.passwordTips') }}</span>
      </template>
    </el-popover>
  </div>
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
      <el-button @click="doShow">
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
  import { AppStore } from '@/store/app'
  import { MessageSuccess } from '@/util/Element'
  import { showPassPrompt } from '@/util/Brew'
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
      doShow() {
        if (!this.show) {
          showPassPrompt(false)
            .then(() => {
              this.show = true
            })
            .catch()
        } else {
          this.show = false
        }
      },
      resetPassword() {
        showPassPrompt(false)
          .then(() => {
            MessageSuccess(this.$t('base.success'))
          })
          .catch()
      }
    }
  })
</script>
