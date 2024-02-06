<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li :class="current_tab === 0 ? 'active' : ''" @click="current_tab = 0"
        >{{ tabs[0] }}
        <yb-icon
          :svg="import('@/svg/icon_refresh.svg?raw')"
          width="18"
          height="18"
          @click.stop="refreshVersions"
        />
      </li>
      <li :class="current_tab === 3 ? 'active' : ''" @click="current_tab = 3">{{ tabs[3] }}</li>
    </ul>
    <div class="main-block">
      <Service v-if="current_tab === 0" ref="service" type-flag="php"></Service>
      <Manager v-else-if="current_tab === 3" type-flag="php"></Manager>
    </div>
  </div>
</template>

<script>
  import { ref } from 'vue'
  import Service from './List.vue'
  import Manager from '../VersionManager/index.vue'

  const current_tab = ref(0)

  export default {
    name: 'MoPhpPanel',
    components: {
      Service,
      Manager
    },
    props: {},
    data() {
      return {
        current_tab,
        tabs: [
          this.$t('base.service'),
          this.$t('base.configFile'),
          this.$t('base.versionSwitch'),
          this.$t('base.versionManager'),
          'FPM日志',
          this.$t('base.slowLog'),
          '扩展'
        ]
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    unmounted() {},
    methods: {
      refreshVersions() {
        this.$refs.service?.reinit()
      }
    }
  }
</script>
