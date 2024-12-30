import { reactive } from 'vue'

export type ProjectTypes = 'PHP' | 'NodeJS'

export type ProjectPHPForm = {
  dir: string
  php: string
  composer: string
  version: string | undefined
}

export const ProjectSetup = reactive<{
  tab: ProjectTypes
  collapse: Partial<Record<ProjectTypes, string[]>>
  search: Partial<Record<ProjectTypes, string>>
  running: Partial<Record<ProjectTypes, boolean>>
  log: Partial<Record<ProjectTypes, string[]>>
  form: {
    PHP: ProjectPHPForm
  }
}>({
  tab: 'PHP',
  collapse: {},
  search: {},
  running: {},
  log: {},
  form: {
    PHP: {
      dir: '',
      php: '',
      composer: '',
      version: undefined
    }
  }
})
