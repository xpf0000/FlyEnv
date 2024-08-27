<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li v-for="(item, index) in tabs" :key="index" :class="current_tab === index ? 'active' : ''"
        @click="current_tab = index">{{ item }}</li>
    </ul>
    <div class="main-block">
      <Service v-if="current_tab === 0" ref="service" type-flag="php"></Service>
      <Manager url="https://windows.php.net/download/" title="PHP" v-else-if="current_tab === 1" type-flag="php">
      </Manager>
      <Composer v-else-if="current_tab === 2" type-flag="composer">
      </Composer>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue'
import Service from './List.vue'
import Manager from '../VersionManager/index.vue'
import Composer from './Composer.vue'

const current_tab = ref(0)

export default {
  name: 'MoPhpPanel',
  components: {
    Service,
    Manager,
    Composer
  },
  props: {},
  data() {
    return {
      current_tab,
      tabs: [
        this.$t('base.service'),
        this.$t('base.versionManager'),
        'Composer'
      ]
    }
  },
  computed: {},
  watch: {},
  created: function () { },
  unmounted() { },
  methods: {}
}
</script>
