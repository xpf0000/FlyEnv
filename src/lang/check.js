/**
 * Detect differences between language packs and not used key
 */

// src/lang/check-unused.js
const fs = require('fs')
const path = require('path')
const glob = require('glob') // 需要安装：npm install glob

// 配置
const PROJECT_ROOT = path.join(__dirname, '..')
const LANG_DIR = path.join(PROJECT_ROOT, 'lang')
const FILE_EXTENSIONS = ['.vue', '.js', '.ts', '.mjs']
const STRICT_KEY_PATTERN = /['"`]([a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-.]+)['"`]/g

function diffKey() {
  const FILE_EXTENSION = '.json'
  function detectLanguageDifferences() {
    // 1. Get all language packs
    const languagePacks = fs
      .readdirSync(LANG_DIR)
      .filter((file) => fs.statSync(path.join(LANG_DIR, file)).isDirectory())

    if (languagePacks.length < 2) {
      console.log('At least 2 language packs are required for comparison')
      return
    }

    // 2. Collect all JSON files (across all language packs)
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

    // 3. Analyze differences
    const results = {
      missingFiles: {},
      keyDifferences: {}
    }

    // 3.1 Check for missing files
    Array.from(allFiles).forEach((file) => {
      const missingPacks = languagePacks.filter((pack) => !fileMap[file].includes(pack))
      if (missingPacks.length > 0) {
        results.missingFiles[file] = missingPacks
      }
    })

    // 3.2 Check key differences (for each file)
    Array.from(allFiles).forEach((file) => {
      const fileResults = {
        allKeys: new Set(),
        packKeys: {}
      }

      // Collect keys from all language packs
      fileMap[file].forEach((pack) => {
        const content = require(path.join(LANG_DIR, pack, file))
        const keys = getFlattenedKeys(content)
        fileResults.packKeys[pack] = new Set(keys)
        keys.forEach((key) => fileResults.allKeys.add(key))
      })

      // Find missing keys for each pack
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

    // 4. Output results
    console.log('\n=== Full Language Pack Difference Report ===\n')

    // 4.1 Output missing files
    if (Object.keys(results.missingFiles).length > 0) {
      console.log('Missing file report:')
      Object.entries(results.missingFiles).forEach(([file, packs]) => {
        console.log(`[${file}] missing in: ${packs.join(', ')}`)
      })
      console.log('\n')
    } else {
      console.log('✅ All language pack file structures are consistent\n')
    }

    const contents = {}

    // 4.2 Output key differences
    let hasKeyDifferences = false
    Object.entries(results.keyDifferences).forEach(([file, diff]) => {
      if (Object.keys(diff.missingKeys).length > 0) {
        hasKeyDifferences = true
        console.log(`\nFile [${file}] key differences:`)
        Object.entries(diff.missingKeys).forEach(([key, packs]) => {
          console.log(`  Key "${key}" missing in: ${packs.join(', ')}`)
          const has = !packs.includes('zh') ? 'zh' : languagePacks.find((n) => !packs.includes(n))
          const filePath = path.join(LANG_DIR, has, file)
          if (fs.existsSync(filePath)) {
            let content = contents[filePath]
            if (!content) {
              content = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
              contents[filePath] = content
            }
            const keyValue = content[key]
            for (const lang of packs) {
              const langFilePath = path.join(LANG_DIR, lang, file)
              if (fs.existsSync(langFilePath)) {
                let content = contents[langFilePath]
                if (!content) {
                  content = JSON.parse(fs.readFileSync(langFilePath, 'utf-8'))
                  contents[langFilePath] = content
                }
                content[key] = keyValue
              }
            }
          }
        })
      }
    })

    for (const file in contents) {
      const content = contents[file]
      fs.writeFileSync(file, JSON.stringify(content, null, 2))
    }

    if (!hasKeyDifferences) {
      console.log('✅ All language pack keys are fully consistent')
    }
  }

  // Get flattened keys (keep original structure)
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

  // Run detection
  detectLanguageDifferences()
}

function checkNoUseKey() {
  const excludeLangFile = ['menu', 'aside', 'toolType']

  const allLangFile = new Set()
  const allKeys = new Map() // Format: { 'filename.key': Set(language packs containing this key) }
  const usedKeys = new Set()
  // 1. Collect all language keys
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

  // 2. Scan key usage in project (strict mode)
  function scanKeyUsageStrict() {
    const filePatterns = FILE_EXTENSIONS.map((ext) => path.join(PROJECT_ROOT, '**', '*' + ext))

    filePatterns.forEach((pattern) => {
      glob.sync(pattern).forEach((file) => {
        const content = fs.readFileSync(file, 'utf8')
        let match

        while ((match = STRICT_KEY_PATTERN.exec(content)) !== null) {
          // Only match strings in the format filename.key
          if (isValidKeyFormat(match[1])) {
            usedKeys.add(match[1])
          }
        }
      })
    })
  }

  // Validate key format as filename.key
  function isValidKeyFormat(key) {
    const parts = key.split('.')
    if (parts.length < 2) return false

    // The first part should be the json filename (without extension)
    const fileName = parts[0]
    return allLangFile.has(fileName)
  }

  // 3. Get flattened keys (keep original structure)
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

  // 4. Main function
  function findUnusedKeys() {
    console.log('🔍 Start detecting unused i18n keys (strict mode)...\n')

    // Collect all keys
    collectAllLanguageKeys()
    console.log(`✅ Found ${allKeys.size} i18n keys in total`)

    // Scan used keys
    scanKeyUsageStrict()
    console.log(`✅ Found ${usedKeys.size} used keys\n`)

    // Find unused keys
    const unusedKeys = new Map()
    allKeys.forEach((packs, key) => {
      if (!usedKeys.has(key)) {
        unusedKeys.set(key, packs)
      }
    })

    // Output results
    if (unusedKeys.size === 0) {
      console.log('🎉 No unused i18n keys found!')
      return
    }

    const languagePacks = fs
      .readdirSync(LANG_DIR)
      .filter((file) => fs.statSync(path.join(LANG_DIR, file)).isDirectory())

    const contents = {}

    console.log(`⚠️ Found ${unusedKeys.size} unused keys:\n`)
    unusedKeys.forEach((packs, key) => {
      console.log(`• ${key} (exists in: ${Array.from(packs).join(', ')})`)
      const arr = key.split('.')
      const fileName = arr.shift()
      if (arr.length === 1) {
        const langKey = arr.shift()
        for (const enDir of languagePacks) {
          const file = path.join(LANG_DIR, enDir, `${fileName}.json`)
          if (fs.existsSync(file)) {
            let content = contents[file]
            if (!content) {
              content = JSON.parse(fs.readFileSync(file, 'utf-8'))
              contents[file] = content
            }
            delete content?.[langKey]
            console.log(`• ${key} has been deleted from ${enDir}/${fileName}.json`)
          }
        }
      }
    })

    for (const file in contents) {
      const content = contents[file]
      fs.writeFileSync(file, JSON.stringify(content, null, 2))
    }

    console.log('\n💡 Suggestion:')
    console.log('1. These keys may be deprecated and can be considered for removal')
    console.log('2. If they are dynamically generated keys, please ensure their format is filename.key')
  }

  // Run detection
  findUnusedKeys()
}

diffKey()
checkNoUseKey()
