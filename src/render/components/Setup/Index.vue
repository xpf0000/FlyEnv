<template>
  <div class="nginx-panel main-right-panel">
    <ul class="top-tab">
      <li
        v-for="(item, index) in tabs"
        :key="index"
        :class="current_tab === index ? 'active' : ''"
        @click="current_tab = index"
        >{{ item }}</li
      >
    </ul>
    <div class="main-block">
      <Common v-if="current_tab === 0"></Common>
      <Config v-if="current_tab === 1" type-flag="nginx"></Config>
      <Config v-if="current_tab === 2" type-flag="apache"></Config>
      <Config v-if="current_tab === 3" type-flag="mysql"></Config>
      <Config v-if="current_tab === 4" type-flag="php"></Config>
      <Config v-if="current_tab === 5" type-flag="memcached"></Config>
      <Config v-if="current_tab === 6" type-flag="redis"></Config>
    </div>
  </div>
</template>

<script>
  import Common from './Common.vue'
  import Config from './Config.vue'

  export default {
    components: {
      Common,
      Config
    },
    props: {},
    data() {
      return {
        current_tab: 0,
        tabs: ['通用', 'Nginx', 'Apache', 'Mysql', 'Php', 'Memcached', 'Redis']
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    methods: {}
  }
</script>
