<template>
  <el-container id="container">
    <Aside />
    <router-view />
  </el-container>
</template>

<script>
  import Aside from '@web/components/Aside/Index.vue'

  export default {
    name: 'MoMain',
    components: {
      Aside
    },
    computed: {},
    methods: {}
  }
</script>
