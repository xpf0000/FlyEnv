<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Versions v-if="current_tab === 0"></Versions>
    </div>
  </div>
</template>

<script>
  import Versions from './List.vue'
  export default {
    name: 'MoNodejsPanel',
    components: {
      Versions
    },
    props: {},
    data() {
      return {
        tab: 0,
        current_tab: 0,
        tabs: ['NodeJS']
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    methods: {}
  }
</script>
