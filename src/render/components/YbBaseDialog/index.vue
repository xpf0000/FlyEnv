<template>
  <el-dialog
    v-model="isShow"
    :title="title"
    :width="width"
    :custom-class="className"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    @closed="closed"
  >
    <div ref="contentWapper"></div>
    <template #footer>
      <div v-if="footerShow" class="dialog-footer">
        <el-button @click="isShow = false">取 消</el-button>
        <el-button type="primary" @click="onSubmit">确 定</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script>
  /**
   * @author 徐鹏飞 250881478@qq.com
   * @desc 全局通用弹窗组件
   */
  import { VueExtend } from '../../core/VueExtend.js'
  import { extend } from 'lodash'
  export default {
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
        isShow: false // 是否显示
      }
    },
    created() {
      this.isShow = this.show
    },
    beforeCreate() {},
    unmounted() {},
    mounted() {
      if (!this.component) {
        return
      }
      this.$nextTick(() => {
        const data = this.data
        this.vm = VueExtend(this.component)
        this.vmInstance = this.vm.mount(this.$refs.contentWapper)
        extend(this.vmInstance.$data, data)
        this.vmInstance.callBack = this.callBack
      })
    },
    methods: {
      closed() {
        this.callBack = null
        this.$el.remove()
        this.$el = null
        this.vmInstance = null
        this.vm && this.vm.unmount()
        this.vm = null
        this.onClosed()
        this.$destroy()
      },
      close() {
        this.isShow = false
      },
      /**
       * 点击确定时的方法, 调用内部组件的onSubmit方法
       */
      onSubmit() {
        this.vmInstance.onSubmit && this.vmInstance.onSubmit()
      }
    }
  }
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
