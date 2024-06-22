<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li :class="current_tab === 0 ? 'active' : ''" @click="current_tab = 0">{{ tabs[0] }} </li>
      <li :class="current_tab === 1 ? 'active' : ''" @click="current_tab = 1">{{ tabs[1] }}</li>
    </ul>
    <div class="main-block">
      <Service v-if="current_tab === 0" ref="service" type-flag="php"></Service>
      <Manager url="https://windows.php.net/download/" title="PHP" v-else-if="current_tab === 1" type-flag="php"></Manager>
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
          this.$t('base.versionManager')
        ]
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    unmounted() {},
    methods: {}
  }
</script>
