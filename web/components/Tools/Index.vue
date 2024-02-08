<template>
  <div class="main-right-panel">
    <ul class="tools-panel">
      <li @click="showPage('sslmake')">
        <yb-icon :svg="import('@/svg/sslmake.svg?raw')" width="30" height="30" />
        <span>SSL Make</span>
      </li>
      <li @click="showPage('fileinfo')">
        <yb-icon :svg="import('@/svg/fileinfo.svg?raw')" width="30" height="30" />
        <span>File Info</span>
      </li>
      <li @click="showPage('timestamp')">
        <yb-icon :svg="import('@/svg/time.svg?raw')" width="30" height="30" style="padding: 2px" />
        <span>Timestamp</span>
      </li>
      <li @click="showPage('decode')">
        <yb-icon
          :svg="import('@/svg/decode.svg?raw')"
          width="30"
          height="30"
          style="padding: 2px"
        />
        <span>Decode/Encode</span>
      </li>
      <li @click="showPage('portkill')">
        <yb-icon
          :svg="import('@/svg/portkill.svg?raw')"
          width="30"
          height="30"
          style="padding: 0"
        />
        <span>Port Kill</span>
      </li>
      <li @click="showPage('processkill')">
        <yb-icon :svg="import('@/svg/process.svg?raw')" width="30" height="30" style="padding: 0" />
        <span>Process Kill</span>
      </li>
      <li @click="showPage('phpObfuscator')">
        <yb-icon :svg="import('@/svg/jiami.svg?raw')" width="30" height="30" style="padding: 0" />
        <span>Php Obfuscator</span>
      </li>
      <li @click="showPage('bomClean')">
        <yb-icon :svg="import('@/svg/BOM.svg?raw')" width="30" height="30" style="padding: 1px" />
        <span>UTF8-Bom Clean</span>
      </li>
      <li @click="showPage('siteSucker')">
        <yb-icon :svg="import('@/svg/sucker.svg?raw')" width="30" height="30" />
        <span>Site Sucker</span>
      </li>
    </ul>
    <el-drawer
      ref="host-edit-drawer"
      v-model="show"
      size="75%"
      :destroy-on-close="true"
      class="host-edit-drawer"
      :with-header="false"
    >
      <component :is="component" @doClose="hidePage"></component>
    </el-drawer>
  </div>
</template>

<script>
  import { markRaw, defineAsyncComponent } from 'vue'

  export default {
    components: {},
    data() {
      return {
        show: false,
        component: null
      }
    },
    computed: {},
    methods: {
      showPage(flag) {
        this.show = true
        switch (flag) {
          case 'sslmake':
            this.component = markRaw(defineAsyncComponent(() => import('./SSLMake/index.vue')))
            break
          case 'fileinfo':
            this.component = markRaw(defineAsyncComponent(() => import('./FileInfo/index.vue')))
            break
          case 'timestamp':
            this.component = markRaw(defineAsyncComponent(() => import('./Timestamp/index.vue')))
            break
          case 'decode':
            this.component = markRaw(defineAsyncComponent(() => import('./Decode/index.vue')))
            break
          case 'portkill':
            this.component = markRaw(defineAsyncComponent(() => import('./PortKill/index.vue')))
            break
          case 'processkill':
            this.component = markRaw(defineAsyncComponent(() => import('./ProcessKill/index.vue')))
            break
          case 'phpObfuscator':
            this.component = markRaw(
              defineAsyncComponent(() => import('./PhpObfuscator/index.vue'))
            )
            break
          case 'bomClean':
            this.component = markRaw(defineAsyncComponent(() => import('./BomClean/index.vue')))
            break
          case 'siteSucker':
            this.component = markRaw(defineAsyncComponent(() => import('./SiteSucker/index.vue')))
            break
        }
      },
      hidePage() {
        this.component = null
        this.show = false
      }
    }
  }
</script>
