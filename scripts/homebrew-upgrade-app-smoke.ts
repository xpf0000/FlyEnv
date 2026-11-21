import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, cp, readFile, writeFile, rm, chmod, realpath } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import electron from 'electron'
import viteConfig from '../configs/vite.config'
import { buildLanguageAssets } from './build-language-assets'
const output = resolve('.superpowers/sdd/2026-11-07-homebrew-language-upgrade/app-smoke')
await mkdir(output, { recursive: true })
await rm(join(output, 'result.json'), { force: true })
const root = await realpath(await mkdtemp(join(tmpdir(), 'flyenv-brew-smoke-')))
const server = await createServer({
  ...viteConfig.serverConfig,
  configFile: false,
  server: { port: 0, host: '127.0.0.1', strictPort: true }
})
let child: ReturnType<typeof spawn> | undefined
try {
  await mkdir(join(root, 'prefix/bin'), { recursive: true })
  await mkdir(join(root, 'prefix/Cellar/php/8.5.7/sbin'), { recursive: true })
  await writeFile(
    join(root, 'prefix/Cellar/php/8.5.7/INSTALL_RECEIPT.json'),
    JSON.stringify({
      source: { tap: 'homebrew/core' },
      arch: process.arch === 'arm64' ? 'arm64' : 'x86_64'
    })
  )
  const brew = join(root, 'prefix/bin/brew')
  await writeFile(
    brew,
    `#!${process.execPath}
const fs=require('fs'),path=require('path'),root=${JSON.stringify(root)};const args=process.argv.slice(2);const newer=fs.existsSync(path.join(root,'upgraded'));const info={name:'php',full_name:'php',tap:'homebrew/core',versions:{stable:'8.5.12'},revision:0,installed:[{version:newer?'8.5.12':'8.5.7'}],outdated:!newer,pinned:false,dependencies:[]};
const composerMarker = path.join(root, 'composer-installed');
const composer = fs.existsSync(composerMarker) ? fs.readFileSync(composerMarker, 'utf8') : '';
const isComposer = args.some(arg => ['composer', 'homebrew/core/composer'].includes(arg));
const composerInfo = {
  name:'composer', full_name:'composer', tap:'homebrew/core', dependencies:[],
  versions:{stable:'2.9.0'}, installed:composer ? [{version:composer}] : [],
  outdated:composer === '2.8.7'
};
const installComposer = version => {
  const keg = path.join(root, 'prefix/Cellar/composer', version);
  fs.mkdirSync(keg, {recursive:true});
  fs.writeFileSync(path.join(keg, 'INSTALL_RECEIPT.json'), JSON.stringify({source:{tap:'homebrew/core'}}));
  fs.writeFileSync(composerMarker, version);
};
if (isComposer && ['install','uninstall','upgrade'].includes(args[0])) {
  console.log('fixture composer', args[0], process.stdout.isTTY ? 'TTY' : 'pipe');
  if (args[0] === 'install') {
    process.stdin.once('data', data => {
      if (data.toString().trim() === 'y') installComposer('2.8.7');
      else process.exitCode = 1;
      process.stdin.pause();
    });
    setTimeout(() => process.exit(2), 8000).unref();
  } else {
    setTimeout(() => {
      if (args[0] === 'upgrade') installComposer('2.9.0');
      else fs.rmSync(composerMarker, {force:true});
    }, 2200);
  }
} else if (isComposer && args[0] === 'info') {
  const report = () => console.log(JSON.stringify(args.includes('--json=v2') ? {formulae:[composerInfo]} : [composerInfo]));
  if (composer && args.includes('--json')) setTimeout(report, 650);
  else report();
} else if (isComposer && args[0] === 'outdated') {
  console.log(JSON.stringify({formulae: composerInfo.outdated ? [{name:'composer'}] : []}));
} else if (args[0] === 'info' && args.includes('--installed') && composer) {
  console.log(JSON.stringify({formulae:[info, composerInfo]}));
} else if(args[0]==='--prefix')console.log(path.join(root,'prefix'));else if(args[0]==='--cellar')console.log(path.join(root,'prefix/Cellar'));else if(args[0]==='info' && args.includes('--json=v2') && newer && fs.existsSync(path.join(root,'fail-catalog'))){console.error('fixture catalog query failure');process.exitCode=2}else if(args[0]==='info')console.log(JSON.stringify(args.includes('--json=v2')?{formulae:[info]}:[info]));else if(args[0]==='outdated')console.log(JSON.stringify({formulae:newer?[]:[{name:'php',installed_versions:['8.5.7'],current_version:'8.5.12'}]}));else if(args[0]==='upgrade'){fs.appendFileSync(path.join(root,'events'),'upgrade\\n');console.log('fixture upgrade running', process.stdout.isTTY ? 'TTY' : 'pipe');setTimeout(()=>{if(fs.existsSync(path.join(root,'fail-upgrade'))){console.error('fixture upgrade failure');process.exitCode=9}else{const keg=path.join(root,'prefix/Cellar/php/8.5.12');fs.mkdirSync(path.join(keg,'sbin'),{recursive:true});fs.writeFileSync(path.join(keg,'INSTALL_RECEIPT.json'),JSON.stringify({source:{tap:'homebrew/core'},arch:${JSON.stringify(process.arch === 'arm64' ? 'arm64' : 'x86_64')}}));fs.writeFileSync(path.join(root,'upgraded'),'yes');console.log('fixture upgrade complete')}},2000)}else if(args[0]==='tap')console.log('shivammathur/php');else if(args[0]==='search')console.log('php');else{console.error('unexpected fake brew command');process.exitCode=2}`
  )
  await chmod(brew, 0o755)
  await server.listen()
  const port = (server.httpServer!.address() as any).port
  await cp('static', 'dist/electron/static', { recursive: true })
  await buildLanguageAssets({
    sourceRoot: resolve('src/lang'),
    outputRoot: resolve('dist/electron/static/lang')
  })
  await build({
    platform: 'node',
    format: 'esm',
    bundle: true,
    packages: 'external',
    splitting: true,
    outExtension: { '.js': '.mjs' },
    outdir: resolve('dist/electron'),
    entryPoints: {
      'brew-app-smoke': 'test/fixtures/homebrew-upgrade-smoke-host.ts',
      fork: 'src/fork/index.ts'
    },
    plugins: [
      {
        name: 'isolated-homebrew-environment',
        setup(ctx) {
          ctx.onResolve({ filter: /configs\/vite\.port$/ }, () => ({
            path: 'port',
            namespace: 'brew-smoke'
          }))
          ctx.onResolve({ filter: /\/CheckBrew$/ }, () => ({
            path: 'check',
            namespace: 'brew-smoke'
          }))
          ctx.onResolve({ filter: /EnvSyncLocal$/ }, () => ({
            path: 'env',
            namespace: 'brew-smoke'
          }))
          ctx.onResolve({ filter: /(?:module\/Php|\.\.\/Php)$/ }, () => ({
            path: resolve('test/fixtures/homebrew-upgrade-smoke-php.ts')
          }))
          ctx.onLoad({ filter: /.*/, namespace: 'brew-smoke' }, (args) => ({
            loader: 'ts',
            contents:
              args.path === 'port'
                ? `export const ViteDevPort=${port}`
                : args.path === 'env'
                  ? 'export const fetchEnvSyncLocal=async()=>({env:{...process.env}})'
                  : `export const CheckBrewOrPort=()=>{Object.assign(global.Server,{BrewBin:${JSON.stringify(brew)},BrewCellar:${JSON.stringify(join(root, 'prefix/Cellar'))},BrewHome:${JSON.stringify(join(root, 'prefix'))}})}`
          }))
        }
      }
    ]
  })
  const env = {
    ...process.env,
    FLYENV_DATA_ROOT: root,
    BREW_SMOKE_ROOT: root,
    BREW_SMOKE_OUTPUT: output,
    BREW_SMOKE_REPO: process.cwd(),
    BREW_SMOKE_NODE: process.execPath,
    PATH: `${join(root, 'prefix/bin')}:${process.env.PATH}`
  }
  delete (env as NodeJS.ProcessEnv).ELECTRON_RUN_AS_NODE
  child = spawn(electron as unknown as string, [resolve('dist/electron/brew-app-smoke.mjs')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let log = ''
  child.stdout!.on('data', (d) => {
    log = (log + d).slice(-2_000_000)
  })
  child.stderr!.on('data', (d) => {
    log = (log + d).slice(-2_000_000)
  })
  await new Promise<void>((yes, no) => {
    const timer = setTimeout(() => {
      child?.kill('SIGKILL')
      no(new Error('Homebrew app smoke timeout'))
    }, 180_000)
    child!.once('error', no)
    child!.once('exit', () => {
      clearTimeout(timer)
      yes()
    })
  }).finally(() => writeFile(join(output, 'app.log'), log))
  const result = JSON.parse(await readFile(join(output, 'result.json'), 'utf8'))
  console.log(JSON.stringify(result))
  assert.equal(result.ok, true)
} finally {
  if (child && child.exitCode === null) child.kill('SIGKILL')
  await server.close()
  await rm(root, { recursive: true, force: true })
}
