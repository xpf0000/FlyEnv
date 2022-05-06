import { createStore } from 'vuex'

const files = import.meta.globEager('./modules/*')
const modules = {}

console.log('files: ', files)

for (let key in files) {
  const mn = key.replace('./modules/', '')
    .replace('.js', '')
    .replace('.ts', '')
  modules[mn] = files[key].default
}
console.log('modules: ', modules)

Object.keys(modules).forEach((key) => {
  modules[key]['namespaced'] = true
})

const store = createStore({
  modules
})

export default store
