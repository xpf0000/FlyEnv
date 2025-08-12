/**
 * 定义我们支持的编程语言类型。
 * 这来自于你提供的 computed 属性中的 'label'。
 */
export type Language =
  | 'python'
  | 'php'
  | 'golang'
  | 'rust'
  | 'java'
  | 'perl'
  | 'ruby'
  | 'erlang'
  | 'typescript'
  | 'javascript'

// 定义一个启发式规则的结构
type HeuristicRule = {
  pattern: RegExp // 用于匹配的正则表达式
  weight: number // 这条规则的权重（分数）
}

/**
 * 语言检测的核心：为每种语言定义一组启发式规则。
 * 规则的顺序和权重经过精心设计，以区分语法相似的语言。
 * 例如，Deno 和 Bun 的特殊规则会先于通用的 NodeJS 规则被检查。
 */
const languageHeuristics: Record<Language, HeuristicRule[]> = {
  // --- 特定运行时或语法非常独特的语言 ---
  java: [
    { pattern: /public\s+static\s+void\s+main\s*\(\s*String\[\]/, weight: 51 },
    { pattern: /System\.(out|err)\.println/, weight: 30 },
    { pattern: /import\s+java\.\w+\.*;/, weight: 20 },
    { pattern: /public\s+class\s+\w+/, weight: 15 },
    { pattern: /new\s+\w+\s*\(.*\)/, weight: 5 }
  ],
  php: [
    { pattern: /<\?php/, weight: 51 },
    { pattern: /\$\w+\s*=\s*new\s+\w+/, weight: 10 },
    { pattern: /function\s+\w+\s*\(.*\)\s*{/, weight: 5 },
    { pattern: /echo\s|print\s/, weight: 5 },
    { pattern: /\$\w+/, weight: 2 } // PHP 变量以 $ 开头
  ],
  golang: [
    { pattern: /^package\s+\w+/m, weight: 51 },
    { pattern: /func\s+\w+\s*\(.*\)\s*{/, weight: 20 },
    { pattern: /import\s+\(?"\w+"/, weight: 15 },
    { pattern: /fmt\.Println/, weight: 15 },
    { pattern: /:=\s*/, weight: 10 } // Go 的短变量声明
  ],
  rust: [
    { pattern: /fn\s+main\s*\(\)/, weight: 51 },
    { pattern: /println!\s*\(.*\);/, weight: 30 }, // ! 宏是 Rust 的一个强特征
    { pattern: /let\s+mut\s+\w+/, weight: 20 },
    { pattern: /use\s+std::/, weight: 15 },
    { pattern: /fn\s+\w+\s*\(.*\)\s*->/, weight: 10 }
  ],
  erlang: [
    { pattern: /^-\s*module\(\w+\)\./m, weight: 51 },
    { pattern: /^-\s*export\(\[.*\]\)\./m, weight: 40 },
    { pattern: /\w+\(.*\)\s*->/, weight: 30 }, // 函数子句 ->
    { pattern: /;\s*$/, weight: 10 } // 子句以分号结束
  ],
  // --- 脚本语言 ---
  python: [
    { pattern: /^\s*def\s+\w+\s*\(.*\):/m, weight: 30 },
    { pattern: /^\s*import\s+[\w\.]+/m, weight: 15 },
    { pattern: /^\s*from\s+[\w\.]+\s+import/m, weight: 15 },
    { pattern: /__init__/, weight: 10 },
    { pattern: /self\./, weight: 5 }
  ],
  ruby: [
    { pattern: /^\s*def\s+\w+(\(.*\))?$/m, weight: 30 }, // def ... end 是 Ruby 的标志
    { pattern: /\b(puts|gets)\b/, weight: 15 },
    { pattern: /require\s+('|").+('|")/, weight: 10 },
    { pattern: /@\w+/, weight: 5 }, // 实例变量
    { pattern: /\b(do|end)\b/, weight: 5 }
  ],
  perl: [
    { pattern: /use\s+strict;/, weight: 51 },
    { pattern: /my\s+(\$|@|%)\w+;/, weight: 30 }, // my $var;
    { pattern: /^\s*sub\s+\w+\s*{/m, weight: 20 },
    { pattern: /(\$|@|%)\w+/, weight: 5 } // Sigils
  ],
  javascript: [
    // 这个作为 JS 的通用后备选项
    { pattern: /require\s*\(\s*('|").+('|")\s*\)/, weight: 30 }, // CommonJS require
    { pattern: /process\.(argv|env|exit)/, weight: 20 },
    { pattern: /import\s+.*from\s+('|")\w+('|")/, weight: 10 }, // ES Module 导入本地包
    { pattern: /console\.log/, weight: 2 },
    { pattern: /\b(const|let|var|async|await|function)\b/, weight: 1 }
  ],
  typescript: [
    { pattern: /:\s*\w+(<.*>)?(\s*\|\s*\w+)*/, weight: 50 }, // 类型注解，包括联合类型
    { pattern: /interface\s+\w+\s*(extends\s+\w+)?\s*{/, weight: 40 },
    { pattern: /type\s+\w+\s*=\s*(.*\|\s*)*/, weight: 40 },
    { pattern: /declare\s+(const|let|var|function|class|namespace)\s+\w+/, weight: 30 },
    { pattern: /@\w+(\(.*\))?/, weight: 20 }, // 装饰器
    { pattern: /as\s+(const|\w+)/, weight: 15 }, // 类型断言
    { pattern: /import\s+type\s+/, weight: 15 },
    { pattern: /<[A-Z]\w+(,?\s*\w+:\s*\w+)*>/, weight: 10 } // 泛型
  ]
}

// 定义一个检测顺序，确保更特殊的语言（如 Deno）先于更通用的语言（如 NodeJS）被匹配
export const languagesToCheck: Language[] = [
  'java',
  'php',
  'golang',
  'rust',
  'erlang',
  'python',
  'ruby',
  'perl',
  'typescript', // 在 node 之前检测 TypeScript
  'javascript'
]

/**
 * 分析给定的代码字符串，并检测其最有可能的编程语言。
 * @param code 要分析的代码片段。
 * @param minimumConfidenceThreshold 结果需要的最低分数，低于此分数将返回 null。
 * @returns 检测到的语言名称（Language 类型），如果无法确定则返回 null。
 */
export function detectLanguage(code: string, minimumConfidenceThreshold = 10): Language | null {
  const scores: Partial<Record<Language, number>> = {}

  // 初始化所有语言分数为0
  for (const lang of languagesToCheck) {
    scores[lang] = 0
  }

  // 提前处理特殊情况
  if (!code || code.trim() === '') {
    return null
  }

  // 按照预定顺序遍历语言
  for (const lang of languagesToCheck) {
    const rules = languageHeuristics[lang]
    for (const rule of rules) {
      if (rule.pattern.test(code)) {
        scores[lang]! += rule.weight
      }
    }
  }

  // 找出得分最高的语言
  let bestMatch: Language | null = null
  let maxScore = 0

  for (const lang in scores) {
    if (scores[lang as Language]! > maxScore) {
      maxScore = scores[lang as Language]!
      bestMatch = lang as Language
    }
  }

  // 如果最高分低于阈值，我们认为没有足够信心
  if (maxScore < minimumConfidenceThreshold) {
    return null
  }
  return bestMatch
}
