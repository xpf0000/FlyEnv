<template>
  <div class="main-right-panel">
    <ul class="tools-panel">
      <li @click="showPage('env')">
        <yb-icon :svg="import('@/svg/env.svg?raw')" width="30" height="30" />
        <span>{{ $t('util.toolSystemEnv') }}</span>
      </li>
      <li @click="showPage('sslmake')">
        <yb-icon :svg="import('@/svg/sslmake.svg?raw')" width="30" height="30" />
        <span>{{ $t('util.toolSSL') }}</span>
      </li>
      <li @click="showPage('fileinfo')">
        <yb-icon :svg="import('@/svg/fileinfo.svg?raw')" width="30" height="30" />
        <span>{{ $t('util.toolFileInfo') }}</span>
      </li>
      <li @click="showPage('timestamp')">
        <yb-icon :svg="import('@/svg/time.svg?raw')" width="30" height="30" style="padding: 2px" />
        <span>{{ $t('util.toolTimestamp') }}</span>
      </li>
      <li @click="showPage('decode')">
        <yb-icon
          :svg="import('@/svg/decode.svg?raw')"
          width="30"
          height="30"
          style="padding: 2px"
        />
        <span>{{ $t('util.toolDecode') }}</span>
      </li>
      <li @click="showPage('portkill')">
        <yb-icon
          :svg="import('@/svg/portkill.svg?raw')"
          width="30"
          height="30"
          style="padding: 0"
        />
        <span>{{ $t('util.toolPortKill') }}</span>
      </li>
      <li @click="showPage('processkill')">
        <yb-icon :svg="import('@/svg/process.svg?raw')" width="30" height="30" style="padding: 0" />
        <span>{{ $t('util.toolProcessKill') }}</span>
      </li>
      <li @click="showPage('phpObfuscator')">
        <yb-icon :svg="import('@/svg/jiami.svg?raw')" width="30" height="30" style="padding: 0" />
        <span>{{ $t('util.toolPhpObfuscator') }}</span>
      </li>
      <li @click="showPage('bomClean')">
        <yb-icon :svg="import('@/svg/BOM.svg?raw')" width="30" height="30" style="padding: 1px" />
        <span>{{ $t('util.toolUTF8BomClean') }}</span>
      </li>
      <li @click="showPage('siteSucker')">
        <yb-icon :svg="import('@/svg/sucker.svg?raw')" width="30" height="30" />
        <span>{{ $t('util.toolSiteSucker') }}</span>
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
          case 'env':
            this.component = markRaw(defineAsyncComponent(() => import('./SystenEnv/index.vue')))
            break
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
