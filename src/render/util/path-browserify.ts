import _path from 'path-browserify'
const { join, basename, dirname, extname, resolve } = _path

function pathFixedToUnix(path: string) {
  return path
    .split('\\')
    .filter((s) => !!s.trim())
    .join('/')
}

const joinFixed = (...args: string[]) => {
  const arr = args.map((a) => pathFixedToUnix(a))
  return join(...arr)
}

const basenameFixed = (path: string, ext?: string) => {
  return basename(pathFixedToUnix(path), ext)
}

const dirnameFixed = (path: string) => {
  return dirname(pathFixedToUnix(path))
}

const extnameFixed = (path: string) => {
  return extname(pathFixedToUnix(path))
}

const resolveFixed = (...args: string[]) => {
  const arr = args.map((a) => pathFixedToUnix(a))
  return resolve(...arr)
}

export {
  joinFixed as join,
  basenameFixed as basename,
  dirnameFixed as dirname,
  extnameFixed as extname,
  resolveFixed as resolve
}
