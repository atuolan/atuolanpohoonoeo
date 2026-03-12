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

    // 角色描述
    this.register({
      name: 'description',
      description: '角色描述',
      handler: () => this.context.charDescription || '',
    })

    // 角色性格
    this.register({
      name: 'personality',
      description: '角色性格',
      handler: () => this.context.charPersonality || '',
    })

    // 場景
    this.register({
      name: 'scenario',
      description: '場景描述',
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

    // 匹配 {{macroName}} 或 {{macroName::arg1::arg2}}
    const macroPattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)((?:::[^}]+)*)\}\}/g

    let result = text
    let match: RegExpExecArray | null
    const processedMacros: Array<{ match: string; replacement: string }> = []

    // 先收集所有需要替換的宏
    while ((match = macroPattern.exec(text)) !== null) {
      const fullMatch = match[0]
      const macroName = match[1]
      const argsStr = match[2]

      const macro = this.macros.get(macroName)
      if (!macro) {
        // 檢查自定義變量
        if (this.context.customVariables && macroName in this.context.customVariables) {
          processedMacros.push({
            match: fullMatch,
            replacement: this.context.customVariables[macroName],
          })
        }
        continue
      }

      // 解析參數
      let args: Record<string, string> | undefined
      if (argsStr) {
        args = {}
        const argParts = argsStr.split('::').filter(s => s)
        argParts.forEach((arg, index) => {
          args![String(index)] = arg
        })
      }

      try {
        const replacement = await macro.handler(args)
        processedMacros.push({ match: fullMatch, replacement })
      } catch (e) {
        console.warn(`Macro "${macroName}" threw an error:`, e)
        processedMacros.push({ match: fullMatch, replacement: '' })
      }
    }

    // 執行替換
    for (const { match, replacement } of processedMacros) {
      result = result.replace(match, replacement)
    }

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
   * 同步替換（不支持異步宏）
   */
  substituteSync(text: string): string {
    if (!text) return ''

    const macroPattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)((?:::[^}]+)*)\}\}/g

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
        const argParts = argsStr.split('::').filter((s: string) => s)
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
  registerVarMacros(store: {
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
  }): void {
    // 局部變量
    this.register({
      name: "getvar",
      description: "讀取局部（當前聊天）變量",
      handler: (args) => store.getLocal(args?.["0"] ?? ""),
    });
    this.register({
      name: "setvar",
      description: "設置局部變量（返回空字串）",
      handler: (args) => {
        store.setLocal(args?.["0"] ?? "", args?.["1"] ?? "");
        return "";
      },
    });
    this.register({
      name: "addvar",
      description: "累加局部變量（數字加法或字串拼接）",
      handler: (args) => {
        store.addLocal(args?.["0"] ?? "", args?.["1"] ?? "0");
        return "";
      },
    });
    this.register({
      name: "incvar",
      description: "局部變量遞增 1，返回新值",
      handler: (args) => store.incLocal(args?.["0"] ?? ""),
    });
    this.register({
      name: "decvar",
      description: "局部變量遞減 1，返回新值",
      handler: (args) => store.decLocal(args?.["0"] ?? ""),
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
