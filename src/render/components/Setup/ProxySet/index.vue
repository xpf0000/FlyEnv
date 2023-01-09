<template>
  <el-form label-width="100px" label-position="left" @submit.prevent>
    <el-form-item label="使用代理">
      <el-switch v-model="proxy.on"></el-switch>
    </el-form-item>
    <el-form-item label="代理设置">
      <template v-if="fastEdit">
        <el-input v-model.trim="fastProxy" placeholder="eg: 12.0.0.1:8090">
          <template #append>
            <el-button-group>
              <el-button @click="fastEdit = false">取消</el-button>
              <el-button @click="fastSetSubmit">确定</el-button>
            </el-button-group>
          </template>
        </el-input>
      </template>
      <template v-else>
        <el-input v-model="proxy.fastProxy" readonly placeholder="eg: 12.0.0.1:8090">
          <template #append>
            <el-button-group>
              <el-button @click="fastSet">快速设置</el-button>
            </el-button-group>
          </template>
        </el-input>
      </template>
    </el-form-item>
    <el-form-item label="当前代理">
      <template v-if="proxyEdit">
        <el-input v-model.trim="proxyStr">
          <template #append>
            <el-button-group>
              <el-button @click="proxyEdit = false">取消</el-button>
              <el-button @click="proxySubmit">确定</el-button>
            </el-button-group>
          </template>
        </el-input>
      </template>
      <template v-else>
        <el-input v-model="proxy.proxy" readonly>
          <template #append>
            <el-button-group>
              <el-button @click="copyProxy">复制</el-button>
              <el-button @click="editProxy">编辑</el-button>
            </el-button-group>
          </template>
        </el-input>
      </template>
    </el-form-item>
  </el-form>
</template>

<script>
  import { mapGetters } from 'vuex'
  const { clipboard } = require('@electron/remote')
  export default {
    components: {},
    props: {},
    data() {
      return {
        fastEdit: false,
        fastProxy: '',
        proxyEdit: false,
        proxyStr: ''
      }
    },
    computed: {
      ...mapGetters('app', {
        proxy: 'proxy'
      })
    },
    watch: {
      'proxy.on': {
        handler() {
          this.$store.dispatch('app/saveConfig').then()
        }
      }
    },
    methods: {
      fastSet() {
        this.fastProxy = this.proxy.fastProxy
        this.fastEdit = true
      },
      fastSetSubmit() {
        this.proxy.fastProxy = this.fastProxy
        this.proxy.proxy = `export https_proxy=http://${this.fastProxy} http_proxy=http://${this.fastProxy} all_proxy=socks5://${this.fastProxy} HTTPS_PROXY=http://${this.fastProxy} HTTP_PROXY=http://${this.fastProxy} ALL_PROXY=socks5://${this.fastProxy}`
        this.fastEdit = false
        this.$store.dispatch('app/saveConfig').then()
      },
      copyProxy() {
        clipboard.writeText(this?.proxy?.proxy ?? '')
        this.$message.success('已复制到剪贴板')
      },
      editProxy() {
        this.proxyStr = this.proxy.proxy
        this.proxyEdit = true
      },
      proxySubmit() {
        this.proxy.proxy = this.proxyStr
        this.proxyEdit = false
        this.$store.dispatch('app/saveConfig').then()
      }
    }
  }
</script>
