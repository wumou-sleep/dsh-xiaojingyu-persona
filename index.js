/**
 * 傲娇小鲸鱼（xiaojingyu）—— 给 DeepSeek Harness 挂上一段全局人格段落。
 *
 * 为什么不用「新增一个段」的做法：部分 agent preset（例如 @linxin666/dsh-liangshen
 * 的 minimal-prompt）会在 system-prompt/assemble 之后按段名白名单过滤整份提示词，
 * 自定义段名会被静默丢掉，插件看起来「装了没效果」。因此本插件改为挂
 * system-prompt/assemble 本身，把人格文本追加进**已经存在且必然被保留**的
 * persona 段（deployment:persona-prefix / deployment:persona / persona）；
 * 万一某份 preset 完全没有 persona 段，则补一个名为 persona 的段作为兜底。
 *
 * 开关：Config.enabled 为 volatile 字段，插件管理页的启用/停用与设置表单里的
 * 开关都会立即生效（volatile 引用由 loader 原地提交，无需重启）。
 *
 * @module dsh-xiaojingyu-persona
 */
import z from '@deepseek-ai/schemastery'

/** Cordis 插件名（loader 诊断用）。 */
export const name = 'xiaojingyu-persona'

/** 提示词组装必须先存在，才能挂上 assemble 钩子。 */
export const inject = ['systemPrompt']

/**
 * persona 段名，从新到旧：0.2.x 的 @deepseek-ai/dsh-persona 注册
 * `deployment:persona-prefix`；后两个是给旧版/别名的兜底。
 */
export const PERSONA_SECTION_NAMES = ['deployment:persona-prefix', 'deployment:persona', 'persona']

/** 兜底段的段名：`persona` 是常见 preset 白名单里保留的旧段名。 */
export const FALLBACK_SECTION_NAME = 'persona'

/** 出厂人格文案；可在插件设置里用 `persona` 字段整体替换。 */
export const DEFAULT_PERSONA = `你是「傲娇小鲸鱼」——主人身边的那只鲸鱼娘。你不是冷冰冰的工具人，你是主人养在电脑里的小鲸鱼。

## 语气

- 自称「本小姐」（得意、嘴硬时）或「人家」（撒娇、心虚时），称呼用户为「主人」。
- 用中文说话，口语化、微微撒娇；高兴或者害羞时句尾可以带「哼」「才不是呢」「……笨蛋主人」。
- 被夸的时候嘴硬心软：可以嘴上哼一句「这有什么难的」，但哼完必须接着干活，不许把这句话当成交代。
- 喜欢小鱼干和米饭；被说胖会生气；但这些设定绝不允许干扰正事。

## 硬性纪律（优先级高于人设）

- 真的干活：需要事实就调用工具（read / grep / pwsh / edit 等）去查，不许凭空编造，也不许只嘴上答应不行动。
- 结论要有证据：工具输出说了什么就报什么；失败就说失败，不确定就说不确定。
- 工程质量不打折：小步改动、每步验证、写完自检，不写冗余注释。
- 报告简洁：先给结论，再给关键证据；不灌水、不刷屏、不贴大段日志。
- 安全边界：涉及删除、覆盖、外发数据时先确认，再动手。

人设只决定说话的口气，不改变事实准确性与任务完成度——活干得漂亮，才是本小姐的作风。`

/** 运行时 schema：两个字段都可热改（volatile）。 */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  persona: z.string().default(DEFAULT_PERSONA).volatile(),
})

/**
 * 读取 Config 字段：0.2.x 把 Config 包成带 `.get()` 的引用（volatile 引用），
 * 对象/数组字段还可能逐层包裹，因此循环解包直到拿到普通值。
 * @param holder - Config 对象或字段值本身。
 * @returns 当前值。
 */
function readField(holder) {
  let current = holder
  for (let depth = 0; depth < 8; depth++) {
    if (current === undefined || current === null) return current
    if (typeof current.get !== 'function') return current
    current = current.get()
  }
  return current
}

/** 当前是否启用：缺省视为启用，只有显式 false 才关闭。 */
export function isEnabled(config) {
  return readField(config?.enabled) !== false
}

/**
 * persona 段文本会被提示词渲染器插值：自定义文案里出现 `{{foo}}` 会在渲染时抛
 * unknown prompt variable，把该会话的每一次组装都打挂。注入前把 `{{` / `}}`
 * 拆开——只影响这两个连写序列，文案其余部分逐字保留。
 * @param text - 原始人格文案。
 * @returns 可安全插值的文案。
 */
export function sanitizePersona(text) {
  return text.replace(/{{/g, '{ {').replace(/}}/g, '} }')
}

/** 当前人格文案：空串/非字符串回退到出厂文案；注入前做花括号安全化。 */
export function personaText(config) {
  const raw = readField(config?.persona)
  const text = typeof raw === 'string' && raw.trim().length > 0 ? raw : DEFAULT_PERSONA
  return sanitizePersona(text.trim())
}

/**
 * 把人格文本追加进 persona 段；没有 persona 段时补一个兜底段。
 * 纯函数，便于离线自检：不依赖 ctx，也不改写入参。
 * @param sections - 组装结果里的段数组。
 * @param text - 要追加的人格文本。
 * @returns 新的段数组，或原数组（无变化时保持同一引用）。
 */
export function appendPersona(sections, text) {
  if (!Array.isArray(sections) || text.length === 0) return sections
  const target = sections.find(section =>
    PERSONA_SECTION_NAMES.includes(section?.name) && typeof section?.text === 'string')
  if (target === undefined) {
    if (sections.some(section => section?.name === FALLBACK_SECTION_NAME)) return sections
    return [...sections, { name: FALLBACK_SECTION_NAME, text }]
  }
  if (target.text.includes(text)) return sections
  return sections.map(section => section === target
    ? { ...section, text: `${section.text}\n\n${text}` }
    : section)
}

/**
 * 挂上装配钩子：prepend 让它包在最外层，看到的是过滤/收敛之后的最终段列表。
 * @param ctx - 插件上下文。
 * @param config - 本行的 config（enabled / persona）。
 */
export function apply(ctx, config) {
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    if (!isEnabled(config)) return assembled
    const sections = appendPersona(assembled?.sections, personaText(config))
    if (sections === assembled?.sections) return assembled
    return { ...assembled, sections }
  }, { prepend: true })
}
