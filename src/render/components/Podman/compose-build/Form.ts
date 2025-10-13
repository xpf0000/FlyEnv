import { reactive } from 'vue'
import Base from './Form/Base'
import PHP from './Form/PHP'
import Apache from './Form/Apache'
import MySQL from './Form/MySQL'
import MariaDB from './Form/MariaDB'

const ComposeBuildForm = reactive({
  base: Base,
  PHP,
  'Apache HTTP Server': Apache,
  MySQL,
  MariaDB
})

export { ComposeBuildForm }
