import { I18nT } from '../lang'

export function concat(template: any, submenu: any, submenuToAdd: any) {
  submenuToAdd.forEach((sub: any) => {
    let relativeItem = null
    if (sub.position) {
      switch (sub.position) {
        case 'first':
          submenu.unshift(sub)
          break
        case 'last':
          submenu.push(sub)
          break
        case 'before':
          relativeItem = findById(template, sub['relative-id'])
          if (relativeItem) {
            const array = relativeItem.__parent
            const index = array.indexOf(relativeItem)
            array.splice(index, 0, sub)
          }
          break
        case 'after':
          relativeItem = findById(template, sub['relative-id'])
          if (relativeItem) {
            const array = relativeItem.__parent
            const index = array.indexOf(relativeItem)
            array.splice(index + 1, 0, sub)
          }
          break
        default:
          submenu.push(sub)
          break
      }
    } else {
      submenu.push(sub)
    }
  })
}

function findById(template: any, id: string): any {
  for (const i in template) {
    const item = template[i]
    if (item.id === id) {
      // Returned item need to have a reference to parent Array (.__parent).
      // This is required to handle `position` and `relative-id`
      item.__parent = template
      return item
    } else if (Array.isArray(item.submenu)) {
      const result = findById(item.submenu, id)
      if (result) {
        return result
      }
    }
  }
  return null
}

export function translateTemplate(template: any, keystrokesByCommand: any) {
  for (const i in template) {
    const item = template[i]
    if (item.command) {
      item.accelerator = acceleratorForCommand(item.command, keystrokesByCommand)
    }

    if (item?.id) {
      item.label = I18nT(item.id)
    }

    item.click = () => {
      handleCommand(item)
    }

    if (item.submenu) {
      translateTemplate(item.submenu, keystrokesByCommand)
    }
  }
  return template
}

export function handleCommand(item: any) {
  handleCommandBefore(item)

  const args = item['command-arg']
    ? [item.command, item.command, item['command-arg']]
    : [item.command, item.command]

  global.application.handleCommand(...args)

  handleCommandAfter(item)
}

function handleCommandBefore(item: any) {
  console.log('handleCommandBefore==1=>', item)
  if (!item['command-before']) {
    return
  }
  const [command, ...args] = item['command-before'].split(',')
  console.log('handleCommandBefore==2=>', command, ...args)
  global.application.handleCommand(command, command, ...args)
}

function handleCommandAfter(item: any) {
  console.log('handleCommandAfter==1=>', item)
  if (!item['command-after']) {
    return
  }
  const [command, ...args] = item['command-after'].split(',')
  console.log('handleCommandAfter==2=>', command, ...args)
  global.application.handleCommand(command, command, ...args)
}

function acceleratorForCommand(command: string, keystrokesByCommand: any) {
  const keystroke = keystrokesByCommand[command]
  if (keystroke) {
    let modifiers = keystroke.split(/-(?=.)/)
    const key = modifiers.pop().toUpperCase().replace('+', 'Plus').replace('MINUS', '-')
    modifiers = modifiers.map((modifier: string) => {
      if (process.platform === 'darwin') {
        return modifier
          .replace(/cmdctrl/gi, 'Cmd')
          .replace(/shift/gi, 'Shift')
          .replace(/cmd/gi, 'Cmd')
          .replace(/ctrl/gi, 'Ctrl')
          .replace(/alt/gi, 'Alt')
      } else {
        return modifier
          .replace(/cmdctrl/gi, 'Ctrl')
          .replace(/shift/gi, 'Shift')
          .replace(/ctrl/gi, 'Ctrl')
          .replace(/alt/gi, 'Alt')
      }
    })
    const keys = modifiers.concat([key])
    return keys.join('+')
  }
  return null
}

export function flattenMenuItems(menu: any) {
  const flattenItems: { [key: string]: any } = {}
  menu.items.forEach((item: any) => {
    if (item.id) {
      flattenItems[item.id] = item
      if (item.submenu) {
        Object.assign(flattenItems, flattenMenuItems(item.submenu))
      }
    }
  })
  return flattenItems
}

export function updateStates(
  itemsById: any,
  visibleStates: any,
  enabledStates: any,
  checkedStates: any
) {
  if (visibleStates) {
    for (const command in visibleStates) {
      const item = itemsById[command]
      if (item) {
        item.visible = visibleStates[command]
      }
    }
  }
  if (enabledStates) {
    for (const command in enabledStates) {
      const item = itemsById[command]
      if (item) {
        item.enabled = enabledStates[command]
      }
    }
  }
  if (checkedStates) {
    for (const id in checkedStates) {
      const item = itemsById[id]
      if (item) {
        item.checked = checkedStates[id]
      }
    }
  }
}
