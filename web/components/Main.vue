<template>
  <el-container id="container">
    <Aside />
    <router-view />
  </el-container>
</template>

<script>
  import Aside from './Aside1/Index.vue'

  export default {
    components: {
      Aside
    },
    computed: {},
    methods: {}
  }
</script>
