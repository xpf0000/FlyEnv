<template>
    <div class="soft-index-panel main-right-panel">
        <ul class="top-tab">
            <template v-for="(item, index) in tabs" :key="index">
                <li :class="current_tab === index ? 'active' : ''" @click="toTab(index)">{{ item }}</li>
            </template>
        </ul>
        <div class="main-block">
            <Service v-if="current_tab === 0"></Service>
            <Manager v-else-if="current_tab === 1" type-flag="java" title="Java"
                url="https://learn.microsoft.com/en-us/java/openjdk/download"></Manager>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, type Ref, ref } from 'vue'
import Service from './List.vue'
import Manager from '../VersionManager/index.vue'

const current_tab: Ref<number> = ref(0)

export default defineComponent({
    components: {
        Service,
        Manager
    },
    props: {},
    data() {
        return {
            current_tab,
            tabs: [this.$t('base.service'), this.$t('base.versionManager')]
        }
    },
    computed: {},
    watch: {},
    created: function () { },
    methods: {
        toTab(tab: number) {
            current_tab.value = tab
        }
    }
})
</script>