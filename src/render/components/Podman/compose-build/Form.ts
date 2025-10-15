import { reactive } from 'vue'
import Base from './Form/Base'
import PHP from './Form/PHP'
import Apache from './Form/Apache'
import MySQL from './Form/MySQL'
import MariaDB from './Form/MariaDB'
import Nginx from './Form/Nginx'
import Caddy from './Form/Caddy'

const ComposeBuildForm = reactive({
  base: Base,
  PHP,
  'Apache HTTP Server': Apache,
  MySQL,
  MariaDB,
  Nginx,
  Caddy
})

export { ComposeBuildForm }
