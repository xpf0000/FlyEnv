export const prettierOptionsDefinitions = {
  alignEntries: {
    name: 'alignEntries',
    type: 'boolean',
    category: 'taplo',
    default: false,
    description: 'Align consecutive entries vertically.'
  },
  alignComments: {
    name: 'alignComments',
    type: 'boolean',
    category: 'taplo',
    default: true,
    description:
      'Align consecutive comments after entries and items vertically. This applies to comments that are after entries or array items.'
  },
  arrayAutoExpand: {
    name: 'arrayAutoExpand',
    type: 'boolean',
    category: 'taplo',
    default: true,
    description: 'Expand arrays to multiple lines that exceed the maximum column width.'
  },
  arrayAutoCollapse: {
    name: 'arrayAutoCollapse',
    type: 'boolean',
    category: 'taplo',
    default: true,
    description: `Collapse arrays that don\'t exceed the maximum column width and don\'t contain comments.`
  },
  compactArrays: {
    name: 'compactArrays',
    type: 'boolean',
    category: 'taplo',
    default: true,
    description: 'Omit white space padding from single-line arrays.'
  },
  compactInlineTables: {
    name: 'compactInlineTables',
    type: 'boolean',
    category: 'taplo',
    default: false,
    description: 'Omit white space padding from the start and end of inline tables.'
  },
  compactEntries: {
    name: 'compactEntries',
    type: 'boolean',
    category: 'taplo',
    default: false,
    description: 'Omit white space around `=`.'
  },
  indentTables: {
    name: 'indentTables',
    type: 'boolean',
    category: 'taplo',
    default: false,
    description:
      'Indent based on tables and arrays of tables and their subtables, subtables out of order are not indented.'
  },
  indentEntries: {
    name: 'indentEntries',
    type: 'boolean',
    category: 'taplo',
    default: false,
    description: 'Indent entries under tables.'
  },
  reorderKeys: {
    name: 'reorderKeys',
    type: 'boolean',
    category: 'taplo',
    default: false,
    description: 'Alphabetically reorder keys that are not separated by empty lines.'
  },
  allowedBlankLines: {
    name: 'allowedBlankLines',
    type: 'int',
    category: 'taplo',
    default: 1,
    description: 'The maximum number of allowed blank lines between entries and tables.'
  }
}
