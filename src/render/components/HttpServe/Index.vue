<template>
  <div class="host-panel main-right-panel">
    <ul class="top-tab">
      <li class="active" @click="doAdd">{{ $t('base.add') }}</li>
    </ul>
    <List ref="list"></List>
  </div>
</template>

<script>
  import List from './List.vue'
  export default {
    components: { List },
    methods: {
      doAdd() {
        this.$refs.list.choosePath()
      }
    }
  }
</script>
