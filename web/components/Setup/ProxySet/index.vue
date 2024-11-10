<template>
  <div class="plant-title">{{ $t('base.proxySetting') }}</div>
  <div class="main proxy-set">
    <el-form label-width="130px" label-position="left" @submit.prevent>
      <el-form-item :label="$t('base.useProxy')">
        <el-switch v-model="proxy.on"></el-switch>
      </el-form-item>
      <el-form-item :label="$t('base.quickSetup')">
        <template v-if="fastEdit">
          <el-input v-model.trim="fastProxy" placeholder="eg: 127.0.0.1:8090">
            <template #append>
              <el-button-group>
                <el-button @click="fastEdit = false">{{ $t('base.cancel') }}</el-button>
                <el-button @click="fastSetSubmit">{{ $t('base.confirm') }}</el-button>
              </el-button-group>
            </template>
          </el-input>
        </template>
        <template v-else>
          <el-input v-model="proxy.fastProxy" readonly placeholder="eg: 127.0.0.1:8090">
            <template #append>
              <el-button-group>
                <el-button @click="fastSet">{{ $t('base.quickSetup') }}</el-button>
              </el-button-group>
            </template>
          </el-input>
        </template>
      </el-form-item>
      <el-form-item :label="$t('base.currentProxy')">
        <template v-if="proxyEdit">
          <el-input v-model.trim="proxyStr">
            <template #append>
              <el-button-group>
                <el-button @click="proxyEdit = false">{{ $t('base.cancel') }}</el-button>
                <el-button @click="proxySubmit">{{ $t('base.confirm') }}</el-button>
              </el-button-group>
            </template>
          </el-input>
        </template>
        <template v-else>
          <el-input v-model="proxy.proxy" readonly>
            <template #append>
              <el-button-group>
                <el-button @click="copyProxy">{{ $t('base.copy') }}</el-button>
                <el-button @click="editProxy">{{ $t('base.edit') }}</el-button>
              </el-button-group>
            </template>
          </el-input>
        </template>
      </el-form-item>
    </el-form>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { AppStore } from '@web/store/app'
  import { MessageSuccess } from '@/util/Element'
  export default defineComponent({
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
      proxy() {
        return AppStore().config.setup.proxy
      }
    },
    watch: {
      'proxy.on': {
        handler() {}
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
      },
      copyProxy() {
        MessageSuccess(this.$t('base.copySuccess'))
      },
      editProxy() {
        this.proxyStr = this.proxy.proxy
        this.proxyEdit = true
      },
      proxySubmit() {
        this.proxy.proxy = this.proxyStr
        this.proxyEdit = false
      }
    }
  })
</script>
