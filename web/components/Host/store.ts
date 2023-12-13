export const RewriteAll: { [key: string]: any } = {}

const all: Record<string, any> = import.meta.globEager('../../../static/rewrite/*.conf', {
  as: 'raw'
})
console.log('all: ', all)
for (const key in all) {
  const name = key.split('/').pop()!.replace('.conf', '')
  RewriteAll[name] = all[key]
}
