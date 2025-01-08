<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <el-radio-button :label="$t('base.add')" :value="0" @click.stop="doAdd"></el-radio-button>
    </el-radio-group>
    <List ref="list"></List>
  </div>
</template>

<script>
  import List from './List.vue'
  export default {
    components: { List },
    data() {
      return {
        tab: 0
      }
    },
    methods: {
      doAdd() {
        this.$refs.list.choosePath()
      }
    }
  }
</script>
