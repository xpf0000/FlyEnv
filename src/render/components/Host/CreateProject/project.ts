import { reactive } from 'vue'
import XTerm from '@/util/XTerm'

export type ProjectTypes = 'PHP' | 'NodeJS' | 'Python' | 'Go'

export type ProjectPHPForm = {
  dir: string
  php: string
  composer: string
  version: string | undefined
  framework: string
}

export type ProjectNodeJSForm = {
  dir: string
  node: string
  version: string | undefined
  framework: string
  running: boolean
  created: boolean
}

export type ProjectForm = {
  dir: string
  bin: string
  version: string | undefined
  framework: string
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
    NodeJS: ProjectNodeJSForm
    Python: ProjectForm
    Go: ProjectForm
  }
  execing: Partial<Record<Exclude<ProjectTypes, 'PHP'>, XTerm>>
  phpFormInit: () => void
}>({
  tab: 'PHP',
  collapse: {},
  search: {},
  log: {},
  execing: {},
  form: {
    PHP: {
      dir: '',
      php: '',
      composer: '',
      version: undefined,
      framework: ''
    },
    NodeJS: {
      dir: '',
      node: '',
      version: undefined,
      framework: '',
      running: false,
      created: false
    },
    Python: {
      dir: '',
      bin: '',
      version: undefined,
      framework: '',
      running: false,
      created: false
    },
    Go: {
      dir: '',
      bin: '',
      version: undefined,
      framework: '',
      running: false,
      created: false
    }
  },
  phpFormInit() {
    this.form.PHP.dir = ''
    this.form.PHP.php = ''
    this.form.PHP.composer = ''
    this.form.PHP.version = undefined
    this.form.PHP.framework = ''
  }
})
