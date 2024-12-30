import { reactive } from 'vue'

export type ProjectTypes = 'PHP' | 'NodeJS'

export type ProjectPHPForm = {
  dir: string
  php: string
  composer: string
  version: string | undefined
  frameWork: string
  running: boolean
  created: boolean
}

export const ProjectSetup = reactive<{
  tab: ProjectTypes
  collapse: Partial<Record<ProjectTypes, string[]>>
  search: Partial<Record<ProjectTypes, string>>
  log: Partial<Record<ProjectTypes, string[]>>
  form: {
    PHP: ProjectPHPForm
  }
  phpFormInit: () => void
}>({
  tab: 'PHP',
  collapse: {},
  search: {},
  log: {},
  form: {
    PHP: {
      dir: '',
      php: '',
      composer: '',
      version: undefined,
      frameWork: '',
      running: false,
      created: false
    }
  },
  phpFormInit() {
    this.form.PHP.dir = ''
    this.form.PHP.php = ''
    this.form.PHP.composer = ''
    this.form.PHP.version = undefined
    this.form.PHP.frameWork = ''
    this.form.PHP.created = false
    this.form.PHP.running = false
  }
})
