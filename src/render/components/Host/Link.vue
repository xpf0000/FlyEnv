<template>
  <div class="host-link">
    <template v-for="(item, index) of hosts" :key="index">
      <el-input :model-value="item" readonly>
        <template #append>
          <el-button-group>
            <el-button @click="copy(item)">{{ $t('base.copy') }}</el-button>
            <el-button @click="open(item)">{{ $t('base.open') }}</el-button>
          </el-button-group>
        </template>
      </el-input>
    </template>
  </div>
</template>

<script>
  const { shell, clipboard } = require('@electron/remote')

  export default {
    name: 'MoHostLink',
    components: {},
    props: {
      host: {
        type: Object,
        default() {
          return {}
        }
      }
    },
    data() {
      return {
        hosts: []
      }
    },
    computed: {},
    watch: {},
    created: function () {
      this.getHosts()
    },
    methods: {
      getHosts() {
        const alias = this.host.alias.split('\n').filter((n) => {
          return n && n.trim().length > 0
        })
        alias.unshift(this.host.name)
        const httpPort = [this.host.port.nginx, this.host.port.apache]
        alias.forEach((n) => {
          httpPort.forEach((p) => {
            const port = p === 80 ? '' : `:${p}`
            this.hosts.push(`http://${n}${port}/`)
          })
        })
        const httpsPort = [this.host.port.nginx_ssl, this.host.port.apache_ssl]
        alias.forEach((n) => {
          httpsPort.forEach((p) => {
            const port = p === 443 ? '' : `:${p}`
            this.hosts.push(`https://${n}${port}/`)
          })
        })
      },
      copy(url) {
        clipboard.writeText(url)
        this.$message.success('链接已复制到剪贴板')
      },
      open(url) {
        shell.openExternal(url)
      }
    }
  }
</script>

<style lang="scss">
  .host-link {
    max-height: 50vh;
    overflow: auto;

    .el-input {
      margin-top: 15px;

      &:first-child {
        margin-top: 0;
      }
    }
    .el-button-group {
      display: flex;
    }
  }
</style>
