import { reactive } from 'vue'

type ProjectTypes = 'PHP' | 'NodeJS'

export const ProjectSetup = reactive<{
  tab: ProjectTypes
  collapse: Record<ProjectTypes, string[]>
  search: Record<ProjectTypes, string>
}>({
  tab: 'PHP',
  collapse: {},
  search: {}
})
