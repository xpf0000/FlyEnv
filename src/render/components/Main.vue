<template>
  <el-container id="container">
    <mo-aside />
    <router-view />
  </el-container>
</template>

<script>
  import Aside from '@/components/Aside/Index.vue'

  export default {
    name: 'MoMain',
    components: {
      [Aside.name]: Aside
    },
    computed: {},
    methods: {}
  }
</script>

<style lang="scss"></style>
