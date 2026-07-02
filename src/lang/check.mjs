import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))

const require = createRequire(import.meta.url)

const glob = require('glob')

// 配置
const PROJECT_ROOT = path.join(__dirname, '..')
const LANG_DIR = path.join(PROJECT_ROOT, 'lang')
const FILE_EXTENSIONS = ['.vue', '.js', '.ts', '.mjs', '.json']
const STRICT_KEY_PATTERN = /['"`]([a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-.]+)['"`]/g
const DUPLICATE_KEY_ALLOWLIST = new Set(['podman.common.yes', 'podman.common.no'])
const INDEX_IMPORT_PATTERN = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]\.\/([^'"]+)\.json['"]/g
const INDEX_ENTRY_PATTERN = /^(['"]?)([^'":]+)\1:\s*([A-Za-z_$][\w$]*)[,]?$/
const INDEX_SHORTHAND_PATTERN = /^([A-Za-z_$][\w$]*)[,]?$/

function getNamespaceIndexFile() {
  const preferredPacks = ['zh', 'en']
  const existingPacks = fs
    .readdirSync(LANG_DIR)
    .filter((file) => fs.statSync(path.join(LANG_DIR, file)).isDirectory())
  const orderedPacks = [...new Set([...preferredPacks, ...existingPacks])]

  for (const pack of orderedPacks) {
    const indexFile = path.join(LANG_DIR, pack, 'index.ts')
    if (fs.existsSync(indexFile)) {
      return { pack, indexFile }
    }
  }

  return null
}

function loadRegisteredNamespaces() {
  const source = getNamespaceIndexFile()
  if (!source) {
    return new Map()
  }

  const { pack, indexFile } = source
  const content = fs.readFileSync(indexFile, 'utf8')
  const importVarToFile = new Map()
  let importMatch

  while ((importMatch = INDEX_IMPORT_PATTERN.exec(content)) !== null) {
    importVarToFile.set(importMatch[1], importMatch[2])
  }

  const namespaceByFile = new Map()
  const lines = content.split(/\r?\n/)
  let inPackBlock = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!inPackBlock) {
      if (line === `${pack}: {`) {
        inPackBlock = true
      }
      continue
    }

    if (line === '}' || line === '},') {
      break
    }

    let entryMatch = line.match(INDEX_ENTRY_PATTERN)
    if (entryMatch) {
      const [, , namespace, importVar] = entryMatch
      const fileName = importVarToFile.get(importVar)
      if (fileName) {
        namespaceByFile.set(fileName, namespace)
      }
      continue
    }

    entryMatch = line.match(INDEX_SHORTHAND_PATTERN)
    if (entryMatch) {
      const importVar = entryMatch[1]
      const fileName = importVarToFile.get(importVar)
      if (fileName) {
        namespaceByFile.set(fileName, importVar)
      }
    }
  }

  return namespaceByFile
}

const REGISTERED_NAMESPACE_BY_FILE = loadRegisteredNamespaces()

function getRegisteredNamespace(fileName) {
  return REGISTERED_NAMESPACE_BY_FILE.get(fileName) ?? fileName
}

function getFlattenedKeys(obj, prefix = '') {
  let keys = []
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      keys = keys.concat(getFlattenedKeys(obj[key], fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

function getValueByPath(obj, keyPath) {
  return keyPath.split('.').reduce((cur, key) => cur?.[key], obj)
}

function diffKey() {
  const FILE_EXTENSION = '.json'
  function detectLanguageDifferences() {
    // 1. 获取所有语言包
    const languagePacks = fs
      .readdirSync(LANG_DIR)
      .filter((file) => fs.statSync(path.join(LANG_DIR, file)).isDirectory())

    if (languagePacks.length < 2) {
      console.log('需要至少2个语言包进行比较')
      return
    }

    // 2. 收集所有JSON文件（跨所有语言包）
    const allFiles = new Set()
    const fileMap = {}

    languagePacks.forEach((pack) => {
      const files = fs
        .readdirSync(path.join(LANG_DIR, pack))
        .filter((file) => file.endsWith(FILE_EXTENSION))

      files.forEach((file) => {
        allFiles.add(file)
        if (!fileMap[file]) fileMap[file] = []
        fileMap[file].push(pack)
      })
    })

    // 3. 分析差异
    const results = {
      missingFiles: {},
      keyDifferences: {}
    }

    // 3.1 检查文件缺失情况
    Array.from(allFiles).forEach((file) => {
      const missingPacks = languagePacks.filter((pack) => !fileMap[file].includes(pack))
      if (missingPacks.length > 0) {
        results.missingFiles[file] = missingPacks
      }
    })

    // 3.2 检查键差异（对每个文件）
    Array.from(allFiles).forEach((file) => {
      const fileResults = {
        allKeys: new Set(),
        packKeys: {}
      }

      // 收集所有语言包的键
      fileMap[file].forEach((pack) => {
        const content = require(path.join(LANG_DIR, pack, file))
        const keys = getFlattenedKeys(content)
        fileResults.packKeys[pack] = new Set(keys)
        keys.forEach((key) => fileResults.allKeys.add(key))
      })

      // 找出每个包的缺失键
      const allKeysArray = Array.from(fileResults.allKeys)
      fileResults.missingKeys = {}

      allKeysArray.forEach((key) => {
        const missingPacks = languagePacks.filter((pack) => {
          return fileMap[file].includes(pack) && !fileResults.packKeys[pack].has(key)
        })
        if (missingPacks.length > 0) {
          fileResults.missingKeys[key] = missingPacks
        }
      })

      if (
        Object.keys(fileResults.missingKeys).length > 0 ||
        Object.keys(results.missingFiles).length > 0
      ) {
        results.keyDifferences[file] = fileResults
      }
    })

    // 4. 输出结果
    console.log('\n=== 语言包全面差异报告 ===\n')

    // 4.1 输出缺失文件
    if (Object.keys(results.missingFiles).length > 0) {
      console.log('缺失文件报告:')
      Object.entries(results.missingFiles).forEach(([file, packs]) => {
        console.log(`[${file}] 缺失于: ${packs.join(', ')}`)
      })
      console.log('\n')
    } else {
      console.log('✅ 所有语言包文件结构一致\n')
    }

    // 4.2 输出键差异
    let hasKeyDifferences = false
    Object.entries(results.keyDifferences).forEach(([file, diff]) => {
      if (Object.keys(diff.missingKeys).length > 0) {
        hasKeyDifferences = true
        console.log(`\n文件 [${file}] 键差异:`)
        Object.entries(diff.missingKeys).forEach(([key, packs]) => {
          console.log(`  Key "${key}" 缺失于: ${packs.join(', ')}`)
        })
      }
    })

    if (!hasKeyDifferences) {
      console.log('✅ 所有语言包键完全一致')
    }
  }

  // 执行检测
  detectLanguageDifferences()
}

function checkNoUseKey() {
  const excludeLangFile = ['menu', 'aside', 'toolType']
  const excludeKeys = ['openclaw.category.', 'openclaw.cmd.', 'hermes.category.', 'hermes.cmd.']

  const allLangNamespace = new Set()
  const allKeys = new Map() // 格式: { '文件名.key': Set(包含此键的语言包) }
  const usedKeys = new Set()
  // 1. 收集所有语言键
  function collectAllLanguageKeys() {
    const languagePacks = fs
      .readdirSync(LANG_DIR)
      .filter((file) => fs.statSync(path.join(LANG_DIR, file)).isDirectory())
    languagePacks.forEach((pack) => {
      const jsonFiles = glob
        .sync(path.join(LANG_DIR, pack, '**/*.json'))
        .filter((f) => !excludeLangFile.includes(path.basename(f, '.json')))

      jsonFiles.forEach((file) => {
        const fileName = path.basename(file, '.json')
        const namespace = getRegisteredNamespace(fileName)
        allLangNamespace.add(namespace)

        const content = require(file)
        const keys = getFlattenedKeys(content)

        for (const key of keys) {
          const fullKey = `${namespace}.${key}`
          if (excludeKeys.some((k) => fullKey.includes(k))) {
            continue
          }
          if (!allKeys.has(fullKey)) {
            allKeys.set(fullKey, new Set())
          }
          allKeys.get(fullKey).add(pack)
        }
      })
    })
  }

  // 2. 扫描项目中的键使用情况（严格模式）
  function scanKeyUsageStrict() {
    const filePatterns = FILE_EXTENSIONS.map((ext) => path.join(PROJECT_ROOT, '**', '*' + ext))

    filePatterns.forEach((pattern) => {
      glob.sync(pattern).forEach((file) => {
        const content = fs.readFileSync(file, 'utf8')
        let match

        while ((match = STRICT_KEY_PATTERN.exec(content)) !== null) {
          // 只匹配符合已注册 i18n namespace.key 格式的字符串
          if (isValidKeyFormat(match[1])) {
            usedKeys.add(match[1])
          }
        }
      })
    })
  }

  // 验证键格式是否为 json文件名.key
  function isValidKeyFormat(key) {
    const parts = key.split('.')
    if (parts.length < 2) return false

    // 第一部分应该是实际注册的 i18n namespace
    const namespace = parts[0]
    return allLangNamespace.has(namespace)
  }

  // 4. 主函数
  function findUnusedKeys() {
    console.log('🔍 开始检测未使用的国际化键（严格模式）...\n')

    // 收集所有键
    collectAllLanguageKeys()
    console.log(`✅ 共发现 ${allKeys.size} 个国际化键`)

    // 扫描使用的键
    scanKeyUsageStrict()
    console.log(`✅ 共发现 ${usedKeys.size} 个被使用的键\n`)

    // 找出未使用的键
    const unusedKeys = new Map()
    allKeys.forEach((packs, key) => {
      if (!usedKeys.has(key)) {
        unusedKeys.set(key, packs)
      }
    })

    // 输出结果
    if (unusedKeys.size === 0) {
      console.log('🎉 没有发现未使用的国际化键！')
      return
    }

    console.log(`⚠️ 发现 ${unusedKeys.size} 个未使用的键:\n`)
    unusedKeys.forEach((packs, key) => {
      console.log(`• ${key} (存在于: ${Array.from(packs).join(', ')})`)
    })

    console.log('\n💡 建议：')
    console.log('1. 这些键可能是废弃键，可以考虑移除')
    console.log('2. 如果是动态生成的键，请确保其格式为已注册的 i18n namespace.key')
  }

  // 运行检测
  findUnusedKeys()
}

function reportDuplicateCandidates() {
  const seedLangs = ['zh', 'en']
  const byValue = new Map()

  seedLangs.forEach((lang) => {
    const langDir = path.join(LANG_DIR, lang)
    const files = fs.readdirSync(langDir).filter((file) => file.endsWith('.json'))

    files.forEach((file) => {
      const fileName = path.basename(file, '.json')
      const content = require(path.join(langDir, file))
      const keys = getFlattenedKeys(content)

      keys.forEach((key) => {
        const value = getValueByPath(content, key)
        const fullKey = `${getRegisteredNamespace(fileName)}.${key}`

        if (DUPLICATE_KEY_ALLOWLIST.has(fullKey) || typeof value !== 'string') {
          return
        }

        if (!byValue.has(value)) {
          byValue.set(value, new Set())
        }
        byValue.get(value).add(fullKey)
      })
    })
  })

  const candidates = Array.from(byValue.entries())
    .map(([value, keys]) => [value, Array.from(keys).sort()])
    .filter(([, keys]) => keys.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)

  console.log('\n🔍 重复文案候选（zh/en）\n')

  if (candidates.length === 0) {
    console.log('✅ 没有发现需要关注的重复文案候选')
    return
  }

  candidates.forEach(([value, keys]) => {
    console.log(`• ${JSON.stringify(value)}`)
    keys.forEach((key) => {
      console.log(`  - ${key}`)
    })
  })
}

diffKey()
checkNoUseKey()
reportDuplicateCandidates()
