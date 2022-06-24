<template>
  <div class="host-link">
    <el-input v-model="formLabelAlign.name" >
      <template #append>
        <el-button-group>
          <el-button>复制</el-button>
          <el-button>打开</el-button>
        </el-button-group>
      </template>
    </el-input>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { handleHost } from '@/util/Host.js'
  const { shell } = require('@electron/remote')

  export default {
    name: 'MoHostLink',
    components: {},
    props: {},
    data() {
      return {
        hosts: [
          'http://mysql.xpf.com',
          'http://sql.xpf.com'
        ]
      }
    },
    computed: {
      ...mapGetters('app', {
        hosts: 'hosts'
      })
    },
    watch: {},
    created: function () {
      console.log('this.hosts: ', this.hosts)
    },
    unmounted() {},
    methods: {
      action(item, index, flag) {
        console.log('item: ', item)
        this.task_index = index
        switch (flag) {
          case 'open':
            shell.showItemInFolder(item.root)
            break
          case 'edit':
            this.$baseEventBus.emit('Host-Edit-Item', item)
            break
          case 'log':
            this.$baseEventBus.emit('Host-Logs-Item', item)
            break
          case 'del':
            this.$baseConfirm('确认删除?', null, {
              customClass: 'confirm-del',
              type: 'warning'
            })
              .then(() => {
                handleHost(item, 'del')
              })
              .catch(() => {})
            break
          case 'link':
            console.log('item: ', item)
            break
        }
        const poper = this.$refs['host-list-poper-' + this.task_index][0]
        console.log('poper: ', poper)
        poper && poper.hide()
      }
    }
  }
</script>

<style lang="scss">
  .confirm-del {
    background: #32364a !important;
    border: 1px solid #32364a !important;
    color: #fff !important;
    .el-message-box__message,
    .el-message-box__close {
      color: rgba(255, 255, 255, 0.7) !important;
    }
  }
  .host-list {
    display: flex;
    flex-direction: column;
    max-height: 100%;
    .host-item {
      display: flex;
      justify-content: space-between;
      padding: 0 20px;
      align-items: center;
      width: 100%;
      height: 64px;
      &.active {
        background: #32364a;
        .left .info {
          color: #fff;
        }
      }
      &:hover {
        background: #3e4257;
      }
      .left {
        display: flex;
        align-items: center;
        .icon-block {
          width: 44px;
          height: 44px;
          border-radius: 25px;
          background: #004878;
          margin-right: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .info {
          line-height: 1.5;
          display: flex;
          flex-direction: column;
          color: rgba(255, 255, 255, 0.7);
          .name {
            font-size: 15px;
          }
          .url {
            font-size: 12px;
          }
        }
      }
      .right {
        height: 39px;
        width: 30px;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 7px;
        cursor: pointer;
        &:hover {
          background: #282b3d;
        }
      }
    }
  }
  .host-list-menu {
    display: flex;
    flex-direction: column;
    background: #3f4358;
    user-select: none;
    > li {
      display: flex;
      align-items: center;
      padding: 8px 15px;
      cursor: pointer;
      &:hover {
        background: rgb(79, 82, 105);
      }
    }
  }
  .host-list-poper {
    background: #32364a !important;
    border: none !important;
    color: #fff !important;
    padding: 0 !important;
  }
</style>
