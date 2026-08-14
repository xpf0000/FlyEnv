import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  appBaseContextCandidates,
  mergeAppBaseContextCandidates,
  type TomcatContextForm
} from '../src/render/components/Host/Tomcat/site'

const root = join(import.meta.dirname, '..')
const edit = readFileSync(join(root, 'src/render/components/Host/Tomcat/Edit.vue'), 'utf8')
const list = readFileSync(join(root, 'src/render/components/Host/Tomcat/ListTable.vue'), 'utf8')
const rewriteEditor = readFileSync(
  join(root, 'src/render/components/Host/Tomcat/RewriteEditor.vue'),
  'utf8'
)

const appBase = '/workspace/tomcat-webapps'
const candidates = appBaseContextCandidates(appBase, [
  { name: 'portal', kind: 'directory' },
  { name: 'ROOT', kind: 'directory' },
  { name: 'root', kind: 'directory' },
  { name: 'openmrs.WAR', kind: 'war' },
  { name: 'ROOT.war', kind: 'war' },
  { name: 'nested/api.war', kind: 'war' },
  { name: 'bad name.war', kind: 'war' },
  { name: 'README.txt', kind: 'war' }
])

assert.deepEqual(candidates, [
  { path: '/', docBase: '/workspace/tomcat-webapps/ROOT', kind: 'directory' },
  { path: '/openmrs', docBase: '/workspace/tomcat-webapps/openmrs.WAR', kind: 'war' },
  { path: '/portal', docBase: '/workspace/tomcat-webapps/portal', kind: 'directory' },
  { path: '/root', docBase: '/workspace/tomcat-webapps/root', kind: 'directory' }
])

const existing: TomcatContextForm[] = [
  { id: 'manual-root', path: '/', docBase: '/manual/root' },
  { id: 'manual-api', path: '/api', docBase: '/manual/api' }
]
const merged = mergeAppBaseContextCandidates(existing, candidates, (path) => `scan-${path}`)

assert.deepEqual(merged, [
  ...existing,
  { id: 'scan-/openmrs', path: '/openmrs', docBase: '/workspace/tomcat-webapps/openmrs.WAR' },
  { id: 'scan-/portal', path: '/portal', docBase: '/workspace/tomcat-webapps/portal' },
  { id: 'scan-/root', path: '/root', docBase: '/workspace/tomcat-webapps/root' }
])
assert.deepEqual(
  mergeAppBaseContextCandidates(existing, [], (path) => path),
  existing
)

assert.doesNotMatch(edit, /v-model="item\.alias"/)
assert.doesNotMatch(edit, /rendererTomcatNames/)
assert.match(edit, /I18nT\('host\.tomcatContexts'\)/)
assert.match(edit, /v-for="\(context, index\) in tomcat\.contexts"/)
assert.match(edit, /v-model="context\.path"/)
assert.match(edit, /v-model="context\.docBase"/)
assert.match(edit, /chooseDocBase\(context\)/)
assert.match(
  edit,
  /<div class="plant-title flex items-center justify-between">\s*<span>\{\{ I18nT\('host\.tomcatContexts'\) \}\}<\/span>\s*<el-button link :icon="Plus" @click\.stop="addContext"\s*\/?>/
)
assert.match(edit, /v-if="tomcat\.contexts\.length === 0"/)
assert.match(edit, /I18nT\('common\.value\.none'\)/)
assert.match(edit, /<el-button link :icon="Delete" @click\.stop="removeContext\(index\)"\s*\/?>/)
assert.match(edit, /class="context-mapping-row flex items-center gap-2"/)
assert.match(edit, /fs\.subdir\(appBase\)/)
assert.match(edit, /fs\.readdir\(appBase, false\)/)
assert.match(edit, /scanAppBaseContexts\(path\)/)
assert.match(edit, /mergeAppBaseContextCandidates\(/)
assert.doesNotMatch(edit, /tomcatSiteController\.(?:scan|saveScan|discover)/)
assert.match(edit, /<RewriteEditor[^>]*v-model="tomcat\.rewrite\.content"/)
assert.match(edit, /v-model="tomcat\.rewrite\.enabled"/)
assert.match(edit, /tomcatSiteController\.save\(/)
assert.doesNotMatch(edit, /handleHost\(/)
assert.match(rewriteEditor, /defineModel<string>\(\{ required: true \}\)/)
assert.match(rewriteEditor, /:rows="5"/)
assert.doesNotMatch(rewriteEditor, /readFile|writeFile|watchFile|IPC/)

assert.match(list, /import tomcatSiteController from '.\/TomcatSiteController'/)
assert.match(list, /await tomcatSiteController\.save\(item, 'del'/)
assert.match(
  list,
  /await tomcatSiteController\.save\(\s*JSON\.parse\(JSON\.stringify\(quickEdit\.value\)\),\s*'edit',\s*quickEditBack\s*\)/
)
assert.doesNotMatch(list, /import \{ handleHost \} from '@\/util\/Host'/)
assert.doesNotMatch(list, /handleHost\(/)

console.log('tomcat site drawer tests passed')
