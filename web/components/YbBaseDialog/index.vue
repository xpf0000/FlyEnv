<template>
  <el-dialog
    v-model="isShow"
    :title="title"
    :width="width"
    :class="className"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    @closed="closed"
  >
    <div ref="contentWapper"></div>
    <template #footer>
      <div v-if="footerShow" class="dialog-footer">
        <el-button @click="isShow = false">Cancel</el-button>
        <el-button type="primary" @click="onSubmit">Confirm</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts">
  /**
   * @author 徐鹏飞 (Xu Pengfei) 250881478@qq.com
   * @desc Global common dialog component
   */
  import { VueExtend } from '@web/VueExtend'
  import { defineComponent } from 'vue'
  export default defineComponent({
    props: {
      footerShow: {
        type: Boolean,
        default: true
      },
      show: {
        type: Boolean,
        default: false
      },
      title: {
        type: String,
        default: ''
      },
      width: {
        type: String,
        default: '50%'
      },
      className: {
        type: String,
        default: ''
      },
      component: {
        type: Object,
        default: function () {
          return undefined
        }
      },
      data: {
        type: Object,
        default: function () {
          return {}
        }
      }
    },
    data() {
      return {
        isShow: false // Whether to show
      }
    },
    created() {
      this.isShow = this.show
    },
    beforeCreate() {},
    unmounted() {
      console.log('dialog unmounted !!!')
    },
    mounted() {
      if (!this.component) {
        return
      }
      this.$nextTick(() => {
        const data = this.data
        this.vm = VueExtend(this.component, data)
        this.vmInstance = this.vm.mount(this.$refs.contentWapper)
        this.vmInstance.callBack = this.callBack
      })
    },
    methods: {
      closed() {
        this.callBack = null
        this.vmInstance = null
        this.vm && this.vm.unmount()
        this.vm = null
        this.onClosed()
      },
      close() {
        this.isShow = false
      },
      /**
       * Method triggered when clicking confirm, calls the internal component's onSubmit method
       */
      onSubmit() {
        this.vmInstance.onSubmit && this.vmInstance.onSubmit()
      }
    }
  })
</script>
<style>
  .el-dialog {
    display: flex;
    flex-direction: column;
  }
  .el-dialog__header,
  .el-dialog__footer {
    flex-shrink: 0;
  }
  .el-dialog__body {
    flex: 1;
    overflow: auto;
  }
  .dialog_size_800_600 {
    width: 800px !important;
    height: 600px !important;
  }
</style>
