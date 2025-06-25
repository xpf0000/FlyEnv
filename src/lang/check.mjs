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
const FILE_EXTENSIONS = ['.vue', '.js', '.ts', '.mjs']
const STRICT_KEY_PATTERN = /['"`]([a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-.]+)['"`]/g

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

  // 获取嵌套键（保持原样）
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

  // 执行检测
  detectLanguageDifferences()
}

function checkNoUseKey() {
  const excludeLangFile = ['menu', 'aside', 'toolType']

  const allLangFile = new Set()
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
        allLangFile.add(fileName)

        const content = require(file)
        const keys = getFlattenedKeys(content)

        keys.forEach((key) => {
          const fullKey = `${fileName}.${key}`
          if (!allKeys.has(fullKey)) {
            allKeys.set(fullKey, new Set())
          }
          allKeys.get(fullKey).add(pack)
        })
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
          // 只匹配符合 json文件名.key 格式的字符串
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

    // 第一部分应该是json文件名（不含扩展名）
    const fileName = parts[0]
    return allLangFile.has(fileName)
  }

  // 3. 获取嵌套键（保持原样）
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
    console.log('2. 如果是动态生成的键，请确保其格式为 json文件名.key')
  }

  // 运行检测
  findUnusedKeys()
}

diffKey()
checkNoUseKey()
