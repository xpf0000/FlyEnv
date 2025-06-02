<template>
  <el-container id="container" class="overflow-hidden h-screen">
    <Aside />
    <router-view />
  </el-container>
</template>

<script>
  import Aside from '@/components/Aside/Index.vue'

  export default {
    name: 'MoMain',
    components: {
      Aside
    },
    computed: {},
    methods: {}
  }
</script>
