import { reactive } from 'vue'

export type ProjectTypes = 'PHP' | 'NodeJS'

export const ProjectSetup = reactive<{
  tab: ProjectTypes
  collapse: Partial<Record<ProjectTypes, string[]>>
  search: Partial<Record<ProjectTypes, string>>
}>({
  tab: 'PHP',
  collapse: {},
  search: {}
})
