import { computed, ComputedRef, reactive } from 'vue'
import { OllamaLocalModelsSetup } from '@/components/Ollama/models/local/setup'
import { BrewStore, SoftInstalled } from '@/store/brew'
import { AppStore } from '@/store/app'
import { startService } from '@/util/Service'
import { uuid } from '@shared/utils'
import { I18nT } from '@shared/lang'
import type { PromptItem } from '@/components/AI/Prompt/setup'
import { AIOllama } from '@/components/AI/AIOllama'
import type { OllamaModelItem } from '@/components/Ollama/models/all/setup'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import localForage from 'localforage'

export type ChatItem = {
  role: 'user' | 'system' | 'assistant'
  content: string
  images?: string[]
  error?: boolean
}

export type ModelChatItem = AIOllama

export const AISetup = reactive<{
  tab: string
  model: string
  modelChatList: Record<string, ModelChatItem[]>
  content: string
  updateCurrentChatPrompt: (item: PromptItem) => void
  save: () => void
  init: () => void
}>({
  tab: 'flyenv',
  model: '',
  modelChatList: {},
  content: '',
  updateCurrentChatPrompt(item: PromptItem) {
    const currentChat = AISetup.modelChatList?.[AISetup.model]?.find((f) => f.id === AISetup.tab)
    if (!currentChat) {
      return
    }
    currentChat.title = item.name
    currentChat.prompt = item.prompt
    AISetup.save()
  },
  init() {
    localForage
      .getItem('flyenv-ai-chat-list')
      .then((res: any) => {
        if (res && res?.tab) {
          AISetup.tab = res.tab
        }
        if (res && res?.model) {
          AISetup.model = res.model
        }
        if (res && res?.modelChatList) {
          AISetup.modelChatList = reactive(res.modelChatList)
        }
      })
      .catch()
  },
  save() {
    localForage
      .setItem('flyenv-ai-chat-list', {
        tab: AISetup.tab,
        model: AISetup.model,
        modelChatList: AISetup.modelChatList
      })
      .then()
      .catch()
  }
})

export const Setup = () => {
  OllamaLocalModelsSetup.reFetch()

  const collapseList = computed(() => {
    return OllamaLocalModelsSetup.list
  })

  const appStore = AppStore()
  const brewStore = BrewStore()

  const version = computed(() => {
    const flag = 'ollama'
    const server: any = appStore.config.server
    return server?.[flag]?.current
  })

  const currentVersion: ComputedRef<SoftInstalled | undefined> = computed(() => {
    return brewStore
      .module('ollama')
      ?.installed?.find(
        (i) => i.path === version?.value?.path && i.version === version?.value?.version
      )
  })

  const runService = computed(() => {
    return brewStore.module('ollama').installed.find((o) => o.run)
  })

  const runningService = computed(() => {
    return brewStore.module('ollama').installed.find((o) => o.running)
  })

  const serviceStart = () => {
    if (!currentVersion?.value) {
      return
    }
    startService('ollama', currentVersion.value).then(() => {
      OllamaLocalModelsSetup.reFetch()
    })
  }

  const startNewChat = (oitem: OllamaModelItem) => {
    const model = oitem.name
    if (!AISetup.modelChatList[model]) {
      AISetup.modelChatList[model] = reactive([])
    }
    const find = AISetup.modelChatList[model].find((f) => f.chatList.length === 0)
    if (find) {
      AISetup.tab = find.id
      return
    }
    const id = uuid()
    const item = reactive(
      new AIOllama({
        baseUrl: oitem?.url ?? 'http://127.0.0.1:11434',
        id,
        model,
        title: I18nT('prompt.newChat'),
        prompt: I18nT('prompt.default'),
        chatList: [
          {
            role: 'system',
            content: '你是个乐于助人的助手。你可以通过回答我的问题来帮助我。你也可以问我问题。'
          },
          {
            role: 'user',
            content: '帮我用js写一个正则表达式, 提取文本里的手机号码'
          },
          {
            role: 'assistant',
            content:
              '<think>\n好，我现在需要帮用户用JavaScript编写一个正则表达式来提取文本中的手机号码。首先，我得考虑用户的使用场景，可能是在处理一些带有手机号码的字符串数据，比如短信、网页内容等。\n\n接下来，我应该分析手机号码在文本中的常见格式特征。一般来说，手机号码有11位或13位，分组号通常在第一位，接着是区域代码（3位），然后是子网地址（6位）。所以正则表达式需要捕捉这些部分。\n\n然后，我会考虑不同语言中可能用的标点符号和数字的格式。例如，在英文里，手机号码可能有空格、逗号或句号分隔；而在中文里，可能用顿号分隔，或者包含其他 punctuation marks like period or comma.\n\n接下来，我需要设计正则表达式，确保能够覆盖这些情况。比如，开头可以用/^\\D+/, 去除前导的数字或其他符号。然后是区域码，通常是3位数字，所以用\\[0-9]{3}。接着是子网地址，6个数字，所以再加一次\\[0-9]{6}。\n\n分组号必须在第一位前面，所以用\\D+（表示非数字部分）来确保分组号在开头出现。然后是逗号、句号或空格，比如/,., 但是要注意不要重复，比如先用/[^,]+/, 然后接着可能是/,(?:[\\d]{3}[a-f][0-9]{6})?/，这样可以捕捉不同的分隔方式。\n\n最后，处理尾部的子网地址、区域码和分组号。可能需要去掉不必要的字符，比如去掉末尾的空格或逗号，用\\[0-9]{3}[a-zA-Z0-9]{2}/来确保子网地址是6位数字，后面跟着局域网部分可能有2位字母。\n\n我还需要考虑特殊情况，比如手机号码中的某些特殊字符，或者跨语言的情况。例如，在中文中，分隔符可能是顿号，而不是逗号或空格，所以需要处理这种情况。\n\n最后，我会把这些部分整合起来，形成一个完整的正则表达式，确保它可以正确匹配不同的输入格式，提取出正确的手机号码。\n</think>\n\n为了解决用户的问题，我将编写一个正则表达式来提取带有手机号码的字符串中的手机号码。以下是一个示例代码：\n\n```javascript\nconst pattern = /\\D+([0-9]{3})(?:[^,\\s]+[\\d]{3}[a-zA-Z][0-9]{2})?\\D+(?:[., ]?)[0-9]{3}[a-f]\\D{4}/g;\n\nlet matches;\nfor (let i = 0; i < str.length; i++) {\n    if (pattern.exec(str, i) !== null) {\n        matches.push(str[i + pattern.groupCount() + 1]); // 或者直接取子串\n    }\n}\n```\n\n### 解释：\n- **正则表达式分析**：\n  - `\\D+`：去掉前面的非数字字符。\n  - `[0-9]{3}`：区域码（通常为3位数字）。\n  - `([0-9]{3})`：分组号（在第一位后面）。\n  - `(?:[^,\\s]+[\\d]{3}[a-zA-Z][0-9]{2})?`：子网地址和局域网部分（6位数字，后跟一个字母和2位数字），允许逗号或空格。\n  - `\\D+`：去掉后面的非数字字符。\n  - `([., ]?)`：分隔符（逗号、句号或空格）。\n  - `[0-9]{3}[a-f]\\D{4}`：子网地址（6位数字），后跟局域网部分（2位字母和4位数字）。\n\n### 使用示例：\n```javascript\nlet str = "某地手机号码：123-123-123-123-123；另一条：456-789-0ABC-123-456";\nlet matches;\nfor (let i = 0; i < str.length; i++) {\n    if (str.match(pattern, i)) {\n        console.log(str[i]); // 输出手机号码\n    }\n}\n```\n\n### 注意事项：\n- 正则表达式可能会忽略一些特殊情况，如跨语言的分隔符。\n- 如果希望提取的是完整的子网地址和局域网部分（如192.168.0.5），需要调整正则表达式。\n\n这个正则表达式可以处理多种输入格式，包括不同的分隔符和不同的子网结构。'
          },
          {
            role: 'user',
            content: '帮我写一个JS的递归调用'
          },
          {
            role: 'assistant',
            content:
              '<think>\n好，用户现在让我帮他写一个JavaScript的递归函数，并且他希望我直接提供代码。首先，我需要确认什么是递归函数。一般来说，递归函数是通过调用自身来实现某种计算或处理。\n\n接下来，我应该考虑用户可能需要什么样的功能。比如，递归函数可以用来解决问题时，先解决部分问题，然后返回结果去解决更复杂的问题。常见的例子包括求阶乘、斐波那契数列等。\n\n然后，我会思考如何设计一个简单的递归函数框架。通常，递归函数会包含以下几个步骤：\n1. **基本情况**：当问题规模较小或基础条件满足时，直接返回已知结果。\n2. **递归步骤**：将问题分解为更小的子问题，并调用自身来解决。\n\n我可能会想写一个简单的递归函数来计算某个数的阶乘。阶乘的定义是n! = n * (n-1)!，当n <= 0时，返回1作为基本情况。\n\n接下来，我会尝试编写这个简单的递归函数代码。然后，我会思考如何进一步扩展这个函数，使其能够处理更复杂的问题，比如斐波那契数列或字符串分割等。\n\n在编写函数代码时，我需要注意以下几点：\n- **参数处理**：确保函数接收正确的输入。\n- **基本情况的条件**：准确识别何时结束递归过程。\n- **返回值的传递**：正确地将子问题的结果返回给主问题。\n- **异常处理**：避免未定义的情况。\n\n最后，我会测试我的递归函数代码，看看是否能够正确运行并输出预期结果。如果发现问题，我再进行修改和调整。\n\n总结一下，我的思考过程是：\n1. 理解用户的需求，明确需要编写什么样的递归函数。\n2. 选择一个简单的例子来实现基本的递归功能。\n3. 分析递归函数的基本结构和流程。\n4. 编写代码，并测试其正确性。\n5. 如果需要扩展，进一步优化或调整函数逻辑。\n\n通过这样的步骤，我相信能够帮助用户编写出一个有效的递归函数。同时，我也希望他能根据自己的需求进行进一步的调整和完善。\n</think>\n\n好的！让我来为你写一个简单的递归函数框架。你可以根据需要修改或添加功能。\n\n以下是一个基础的递归函数代码示例：\n\n```javascript\nfunction factorial(n) {\n    if (n <= 0) {\n        return 1;\n    }\n    return n * factorial(n - 1);\n}\n```\n\n### 详细解释：\n- **基本情况**：当 `n` 大于等于 0 时，返回 1。这对应了 0! 和 (-1)! 的情况。\n- **递归步骤**：计算 `n * factorial(n - 1)`。这个过程会一直调用自身，直到达到基本情况。\n\n### 示例使用：\n```javascript\nconsole.log(factorial(5)); // 输出: 120\n```\n\n### 可能的扩展：\n如果你需要处理更复杂的递归问题，可以进一步调整函数逻辑。例如，解决字符串分割、排列组合等问题。\n\n你可以根据具体需求添加更多功能或优化代码结构。'
          },
          {
            role: 'user',
            content: 'js数组按照字母顺序排序'
          },
          {
            role: 'user',
            content: 'js数组按照字母顺序排序'
          }
        ]
      })
    )
    AISetup.modelChatList[model].unshift(item as any)
    AISetup.tab = id
    AISetup.model = model
    AISetup.save()
  }

  const toChat = (item?: ModelChatItem) => {
    if (!item) {
      AISetup.tab = 'flyenv'
      AISetup.model = ''
    } else {
      AISetup.tab = item.id
      AISetup.model = item.model
    }
    AISetup.save()
  }

  const delChat = (item: ModelChatItem) => {
    const list = AISetup.modelChatList[item.model]
    const index = list.findIndex((f) => f.id === item.id)
    if (index >= 0) {
      list.splice(index, 1)
    }
    if (AISetup.tab === item.id) {
      const fitem = list?.[0]
      if (fitem) {
        AISetup.tab = fitem.id
        AISetup.model = fitem.model
      } else {
        AISetup.tab = 'flyenv'
        AISetup.model = ''
      }
    }
    AISetup.save()
  }

  const copyChat = (item: ModelChatItem) => {
    const list = AISetup.modelChatList[item.model]
    const index = list.findIndex((f) => f.id === item.id)
    if (index >= 0) {
      const chatItem = list[index]
      const obj = JSON.parse(JSON.stringify(chatItem))
      obj.id = uuid()
      const copy = reactive(new AIOllama(obj))
      list.splice(index + 1, 0, copy as any)
    }
    AISetup.save()
  }

  let EditVM: any
  import('./ChatItemSetup/index.vue').then((res) => {
    EditVM = res.default
  })

  const editChat = (item: ModelChatItem) => {
    AsyncComponentShow(EditVM, {
      item
    }).then(() => {
      AISetup.save()
    })
  }

  return {
    collapseList,
    currentVersion,
    runService,
    runningService,
    serviceStart,
    startNewChat,
    toChat,
    delChat,
    copyChat,
    editChat
  }
}
