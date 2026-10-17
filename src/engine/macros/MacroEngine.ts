/**
 * 宏變量替換引擎
 * 移植自 SillyTavern macros.js
 */

/**
 * 宏定義
 */
export interface MacroDefinition {
  /** 宏名稱 */
  name: string
  /** 描述 */
  description?: string
  /** 替換函數 */
  handler: (args?: Record<string, string>) => string | Promise<string>
}

/**
 * 宏上下文
 */
export interface MacroContext {
  /** 角色名稱 */
  charName: string
  /** 用戶名稱 */
  userName: string
  /** 角色描述 */
  charDescription?: string
  /** 角色性格 */
  charPersonality?: string
  /** 場景 */
  scenario?: string
  /** 當前日期 */
  currentDate?: Date
  /** 聊天消息數量 */
  messageCount?: number
  /** 群組成員（如果是群聊） */
  groupMembers?: string[]
  /** 自定義變量 */
  customVariables?: Record<string, string>
}

/** 從文字中讀出的一個宏 */
interface ParsedMacro {
  name: string
  /** `::` 分隔的原始參數（尚未展開）；`{{name}}` 沒有參數時為 undefined */
  args?: string[]
  /** 宏的原文 */
  raw: string
  /** 宏結尾 `}}` 之後的位置 */
  end: number
}

const MACRO_NAME_PATTERN = /[\p{L}_][\p{L}\p{N}_]*/uy

/**
 * 讀取 open 位置（指向 `{{`）開始的宏；不是合法宏或沒有收尾時回傳 null。
 * 參數以巢狀深度配對大括號，所以參數裡可以再放 {{user}} 之類的宏。
 */
function readMacroAt(text: string, open: number): ParsedMacro | null {
  MACRO_NAME_PATTERN.lastIndex = open + 2
  const nameMatch = MACRO_NAME_PATTERN.exec(text)
  if (!nameMatch) return null
  const name = nameMatch[0]
  let i = open + 2 + name.length

  if (text.startsWith('}}', i)) {
    return { name, raw: text.slice(open, i + 2), end: i + 2 }
  }
  if (!text.startsWith('::', i)) return null

  const args: string[] = []
  let depth = 0
  i += 2
  let argStart = i
  while (i < text.length) {
    if (text.startsWith('{{', i)) {
      depth++
      i += 2
    } else if (text.startsWith('}}', i)) {
      if (depth === 0) {
        args.push(text.slice(argStart, i))
        return { name, args, raw: text.slice(open, i + 2), end: i + 2 }
      }
      depth--
      i += 2
    } else if (depth === 0 && text.startsWith('::', i)) {
      args.push(text.slice(argStart, i))
      i += 2
      argStart = i
    } else {
      i++
    }
  }
  return null
}

function findKeyIgnoreCase(keys: Iterable<string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const key of keys) {
    if (key.toLowerCase() === lower) return key
  }
  return undefined
}

/**
 * 宏引擎
 */
export class MacroEngine {
  /** 註冊的宏 */
  private macros = new Map<string, MacroDefinition>()

  /** 當前上下文 */
  private context: MacroContext = {
    charName: '',
    userName: 'User',
  }

  constructor() {
    this.registerBuiltinMacros()
  }

  /**
   * 註冊內建宏
   */
  private registerBuiltinMacros(): void {
    // 角色名稱
    this.register({
      name: 'char',
      description: '角色名稱',
      handler: () => this.context.charName,
    })

    // 用戶名稱
    this.register({
      name: 'user',
      description: '用戶名稱',
      handler: () => this.context.userName,
    })

    // 角色名稱（如果不是群聊）
    this.register({
      name: 'charIfNotGroup',
      description: '角色名稱（非群聊時）',
      handler: () => {
        if (this.context.groupMembers && this.context.groupMembers.length > 1) {
          return ''
        }
        return this.context.charName
      },
    })

    // 群組成員
    this.register({
      name: 'group',
      description: '群組成員列表',
      handler: () => {
        if (this.context.groupMembers) {
          return this.context.groupMembers.join(', ')
        }
        return this.context.charName
      },
    })

    // 角色描述（{{description}} 和 {{charDescription}} 均可用）
    this.register({
      name: 'description',
      description: '角色描述',
      handler: () => this.context.charDescription || '',
    })
    this.register({
      name: 'charDescription',
      description: '角色描述（同 {{description}}）',
      handler: () => this.context.charDescription || '',
    })

    // 角色性格（{{personality}} 和 {{charPersonality}} 均可用）
    this.register({
      name: 'personality',
      description: '角色性格',
      handler: () => this.context.charPersonality || '',
    })
    this.register({
      name: 'charPersonality',
      description: '角色性格（同 {{personality}}）',
      handler: () => this.context.charPersonality || '',
    })

    // 場景（{{scenario}} 和 {{charScenario}} 均可用）
    this.register({
      name: 'scenario',
      description: '場景描述',
      handler: () => this.context.scenario || '',
    })
    this.register({
      name: 'charScenario',
      description: '場景描述（同 {{scenario}}）',
      handler: () => this.context.scenario || '',
    })

    // 日期相關
    this.register({
      name: 'date',
      description: '當前日期 (YYYY-MM-DD)',
      handler: () => {
        const d = this.context.currentDate || new Date()
        return d.toISOString().split('T')[0]
      },
    })

    this.register({
      name: 'time',
      description: '當前時間 (HH:MM)',
      handler: () => {
        const d = this.context.currentDate || new Date()
        return d.toTimeString().slice(0, 5)
      },
    })

    this.register({
      name: 'weekday',
      description: '星期幾',
      handler: () => {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const d = this.context.currentDate || new Date()
        return days[d.getDay()]
      },
    })

    this.register({
      name: 'isotime',
      description: 'ISO 時間格式',
      handler: () => {
        const d = this.context.currentDate || new Date()
        return d.toISOString()
      },
    })

    this.register({
      name: 'timestamp',
      description: 'Unix 時間戳',
      handler: () => {
        const d = this.context.currentDate || new Date()
        return String(Math.floor(d.getTime() / 1000))
      },
    })

    // 消息相關
    this.register({
      name: 'messageCount',
      description: '消息數量',
      handler: () => String(this.context.messageCount || 0),
    })

    this.register({
      name: 'lastMessage',
      description: '最後一條消息（不分角色）',
      handler: () => this.context.customVariables?.lastMessage || '',
    })

    this.register({
      name: 'lastUserMessage',
      description: '用戶最後一條消息',
      handler: () => this.context.customVariables?.lastUserMessage || '',
    })

    this.register({
      name: 'lastCharMessage',
      description: '角色最後一條消息',
      handler: () => this.context.customVariables?.lastCharMessage || '',
    })

    // 隨機相關
    this.register({
      name: 'random',
      description: '隨機選擇',
      handler: (args) => {
        if (!args || !args['0']) return ''
        const options = Object.values(args).filter(v => v)
        if (options.length === 0) return ''
        return options[Math.floor(Math.random() * options.length)]
      },
    })

    this.register({
      name: 'roll',
      description: '擲骰子 (如 2d6)',
      handler: (args) => {
        const dice = args?.['0'] || '1d6'
        const match = dice.match(/^(\d+)?d(\d+)([+-]\d+)?$/)
        if (!match) return '0'

        const count = parseInt(match[1] || '1')
        const sides = parseInt(match[2])
        const modifier = parseInt(match[3] || '0')

        let total = modifier
        for (let i = 0; i < count; i++) {
          total += Math.floor(Math.random() * sides) + 1
        }
        return String(total)
      },
    })

    // 文本處理
    this.register({
      name: 'trim',
      description: '修剪空白',
      handler: () => '{{trim}}', // 特殊標記，稍後處理
    })

    // 新行
    this.register({
      name: 'newline',
      description: '換行符',
      handler: () => '\n',
    })

    // 原始輸入（保留原文）
    this.register({
      name: 'original',
      description: '原始輸入',
      handler: (args) => args?.['0'] || '',
    })

    // 空值
    this.register({
      name: 'blank',
      description: '空字串',
      handler: () => '',
    })
  }

  /**
   * 註冊宏
   */
  register(macro: MacroDefinition): void {
    this.macros.set(macro.name, macro)
  }

  /**
   * 取消註冊宏
   */
  unregister(name: string): void {
    this.macros.delete(name)
  }

  /**
   * 設置上下文
   */
  setContext(context: Partial<MacroContext>): void {
    this.context = { ...this.context, ...context }
  }

  /**
   * 獲取上下文
   */
  getContext(): MacroContext {
    return { ...this.context }
  }

  /**
   * 替換字串中的宏
   */
  async substitute(text: string): Promise<string> {
    if (!text) return ''

    let result = await this.expandMacros(text)

    // 處理 {{trim}} 標記 - 移除多餘的空行
    if (result.includes('{{trim}}')) {
      result = result
        .split('{{trim}}')
        .map(s => s.trim())
        .join('')
        .replace(/\n{3,}/g, '\n\n')
    }

    return result
  }

  /**
   * 由左到右展開 {{macroName}} 或 {{macroName::arg1::arg2}}。
   * 參數裡的巢狀宏（如 {{setvar::視角::以「我」指稱 {{user}}}}）會在外層宏執行前展開；
   * 執行順序與文字順序一致，所以前面的 setvar 會先於後面的 getvar 生效。
   * 不是宏的大括號、未註冊的宏都原樣保留。
   */
  private async expandMacros(text: string): Promise<string> {
    let output = ''
    let cursor = 0
    while (cursor < text.length) {
      const open = text.indexOf('{{', cursor)
      if (open === -1) break
      output += text.slice(cursor, open)

      const macro = readMacroAt(text, open)
      if (!macro) {
        output += '{{'
        cursor = open + 2
        continue
      }
      output += await this.evaluateMacro(macro)
      cursor = macro.end
    }
    return output + text.slice(cursor)
  }

  private async evaluateMacro(macro: ParsedMacro): Promise<string> {
    const definition = this.findMacro(macro.name)
    if (!definition) {
      // 檢查自定義變量
      const variables = this.context.customVariables
      const key = variables ? findKeyIgnoreCase(Object.keys(variables), macro.name) : undefined
      return key !== undefined ? variables![key] : macro.raw
    }

    // 解析參數
    let args: Record<string, string> | undefined
    if (macro.args) {
      args = {}
      for (const [index, arg] of macro.args.entries()) {
        args[String(index)] = await this.expandMacros(arg)
      }
    }

    try {
      return await definition.handler(args)
    } catch (e) {
      console.warn(`Macro "${macro.name}" threw an error:`, e)
      return ''
    }
  }

  /** 宏名稱不分大小寫（與 SillyTavern 一致，例如 {{lastusermessage}}） */
  private findMacro(name: string): MacroDefinition | undefined {
    const exact = this.macros.get(name)
    if (exact) return exact
    const key = findKeyIgnoreCase(this.macros.keys(), name)
    return key !== undefined ? this.macros.get(key) : undefined
  }

  /**
   * 同步替換（不支持異步宏）
   */
  substituteSync(text: string): string {
    if (!text) return ''

    const macroPattern = /\{\{([\p{L}_][\p{L}\p{N}_]*)((?:::[^}]*)*)\}\}/gu

    return text.replace(macroPattern, (fullMatch, macroName, argsStr) => {
      const macro = this.macros.get(macroName)
      if (!macro) {
        // 檢查自定義變量
        if (this.context.customVariables && macroName in this.context.customVariables) {
          return this.context.customVariables[macroName]
        }
        return fullMatch
      }

      // 解析參數
      let args: Record<string, string> | undefined
      if (argsStr) {
        args = {}
        const argParts = argsStr.startsWith('::') ? argsStr.slice(2).split('::') : []
        argParts.forEach((arg: string, index: number) => {
          args![String(index)] = arg
        })
      }

      try {
        const result = macro.handler(args)
        if (result instanceof Promise) {
          console.warn(`Macro "${macroName}" is async, returning empty string in sync mode`)
          return ''
        }
        return result
      } catch (e) {
        console.warn(`Macro "${macroName}" threw an error:`, e)
        return ''
      }
    })
  }

  /**
   * 注冊 SillyTavern 相容的局部/全局變量宏
   * 需傳入 chatVariablesStore 的操作代理，避免循環依賴
   */
  registerVarMacros(
    store: {
      getLocal: (name: string) => string;
      setLocal: (name: string, value: string) => void;
      addLocal: (name: string, increment: string) => void;
      incLocal: (name: string) => string;
      decLocal: (name: string) => string;
      getGlobal: (name: string) => string;
      setGlobal: (name: string, value: string) => void;
      addGlobal: (name: string, increment: string) => void;
      incGlobal: (name: string) => string;
      decGlobal: (name: string) => string;
    },
    getVarMode: () => "online" | "f2f" | "gc" = () => "online",
  ): void {
    const toScopedLocalName = (name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName) return "";
      return `${getVarMode()}__${trimmedName}`;
    };

    // 局部變量
    this.register({
      name: "getvar",
      description: "讀取局部（當前聊天）變量",
      handler: (args) => store.getLocal(toScopedLocalName(args?.["0"] ?? "")),
    });
    this.register({
      name: "setvar",
      description: "設置局部變量（返回空字串）；若存在用戶覆蓋值則優先使用，可被單聊天開關停用",
      handler: (args) => {
        const name = toScopedLocalName(args?.["0"] ?? "");
        if (name) {
          const enabledKey = `__enabled__${name}`;
          if (store.getLocal(enabledKey) === "0") {
            store.setLocal(name, "");
            return "";
          }

          const overrideKey = `__override__${name}`;
          const overrideSetKey = `__override_set__${name}`;
          const overrideVal = store.getLocal(overrideKey);
          store.setLocal(name, store.getLocal(overrideSetKey) === "1" ? overrideVal : (args?.["1"] ?? ""));
        }
        return "";
      },
    });
    this.register({
      name: "addvar",
      description: "累加局部變量（數字加法或字串拼接）",
      handler: (args) => {
        const name = toScopedLocalName(args?.["0"] ?? "");
        if (name) store.addLocal(name, args?.["1"] ?? "0");
        return "";
      },
    });
    this.register({
      name: "incvar",
      description: "局部變量遞增 1，返回新值",
      handler: (args) => {
        const name = toScopedLocalName(args?.["0"] ?? "");
        return name ? store.incLocal(name) : "";
      },
    });
    this.register({
      name: "decvar",
      description: "局部變量遞減 1，返回新值",
      handler: (args) => {
        const name = toScopedLocalName(args?.["0"] ?? "");
        return name ? store.decLocal(name) : "";
      },
    });

    // 全局變量
    this.register({
      name: "getglobalvar",
      description: "讀取全局變量",
      handler: (args) => store.getGlobal(args?.["0"] ?? ""),
    });
    this.register({
      name: "setglobalvar",
      description: "設置全局變量（返回空字串）",
      handler: (args) => {
        store.setGlobal(args?.["0"] ?? "", args?.["1"] ?? "");
        return "";
      },
    });
    this.register({
      name: "addglobalvar",
      description: "累加全局變量",
      handler: (args) => {
        store.addGlobal(args?.["0"] ?? "", args?.["1"] ?? "0");
        return "";
      },
    });
    this.register({
      name: "incglobalvar",
      description: "全局變量遞增 1，返回新值",
      handler: (args) => store.incGlobal(args?.["0"] ?? ""),
    });
    this.register({
      name: "decglobalvar",
      description: "全局變量遞減 1，返回新值",
      handler: (args) => store.decGlobal(args?.["0"] ?? ""),
    });
  }

  /**
   * 獲取所有註冊的宏
   */
  getAllMacros(): MacroDefinition[] {
    return Array.from(this.macros.values())
  }

  /**
   * 檢查宏是否存在
   */
  hasMacro(name: string): boolean {
    return this.macros.has(name)
  }
}

// 全局單例
let globalMacroEngine: MacroEngine | null = null

/**
 * 獲取全局宏引擎實例
 */
export function getMacroEngine(): MacroEngine {
  if (!globalMacroEngine) {
    globalMacroEngine = new MacroEngine()
  }
  return globalMacroEngine
}

/**
 * 快速替換宏
 */
export async function substituteParams(text: string, context?: Partial<MacroContext>): Promise<string> {
  const engine = getMacroEngine()
  if (context) {
    engine.setContext(context)
  }
  return engine.substitute(text)
}

/**
 * 快速替換宏（同步版本）
 */
export function substituteParamsSync(text: string, context?: Partial<MacroContext>): string {
  const engine = getMacroEngine()
  if (context) {
    engine.setContext(context)
  }
  return engine.substituteSync(text)
}
