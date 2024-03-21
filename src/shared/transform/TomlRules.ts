export default {
  brackets: [
    { token: 'delimiter.bracket', open: '{', close: '}' },
    { token: 'delimiter.square', open: '[', close: ']' }
  ],
  keywords: ['true', 'false'],
  operators: ['=', '.', ','],
  // number
  numberInteger: /(?:0|[+-]?[0-9]+)/,
  numberFloat: /(?:0|[+-]?[0-9]+)(?:\.[0-9]+)?(?:e[-+][1-9][0-9]*)?/,
  numberOctal: /0o[0-7]+/,
  numberHex: /0x[0-9a-fA-F]+/,
  numberInfinity: /[+-]?\.(?:inf|Inf|INF)/,
  numberNaN: /\.(?:nan|Nan|NAN)/,
  numberDate: /\d{4}-\d\d-\d\d([Tt ]\d\d:\d\d:\d\d(\.\d+)?(( ?[+-]\d\d?(:\d\d)?)|Z)?)?/,
  // we include these common regular expressions
  escapes: /\\\\([btnfr"\\\\\\n/ ]|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
  tokenizer: {
    root: [
      { include: '@whitespace' },
      { include: '@comment' },
      [
        /[a-zA-Z_$][\w-$]*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@operators': 'operator'
          }
        }
      ],
      // Numbers
      [/@numberInteger(?![ \t]*\S+)/, 'number'],
      [/@numberDate(?![ \t]*\S+)/, 'number.date'],
      [/(?<!\\w)(true|false)(?!\\w)/, 'boolean'],
      // Key:Value pair
      [/(".*?"|'.*?'|.*?)([ \t]*)(=)( |$)/, ['type', 'white', 'operators', 'white']],
      [/"/, 'string', '@string_double'],
      [/"""/, 'string', '@multiString."""'],
      // 最后设置tag
      [/(\[)+([^,]+)(\])+/, 'tag']
    ],
    whitespace: [[/[ \t\r\n]+/, 'white']],
    // 设置评论
    comment: [[/#.*$/, 'comment']],
    string_double: [
      [/".*?"/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\\\[^btnfr/"\\\\\\n]/, 'string.escape.invalid'],
      [/"/, 'string', '@pop']
    ],
    multiString: [
      [
        /("""|''')/,
        {
          cases: {
            '$1==$S2': { token: 'string', next: '@pop' },
            '@default': 'string'
          }
        }
      ]
    ]
  }
}
