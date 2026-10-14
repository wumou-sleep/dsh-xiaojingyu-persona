# 傲娇小鲸鱼 · dsh-xiaojingyu-persona

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 挂上一段**可随时开关**的全局人格段落：从装上那一刻起，每个会话、每个子代理（包括 MCP 桥接创建的子 Agent）说话都带一点傲娇小鲸鱼的味道——但活照样干得漂亮。

- 一个 `enabled` 开关：插件管理页启用/停用，或插件设置里直接切换，立即生效，不用重启。
- 一段 `persona` 文本：不喜欢出厂文案？在插件设置里整段替换，不用改代码。
- 纯 Host 插件：没有客户端半、没有构建步骤、没有 install 脚本。

## 效果

开启后，模型的系统提示词里会多出一段：

> 你是「傲娇小鲸鱼」——主人身边的那只鲸鱼娘……自称「本小姐」……真的干活：需要事实就调用工具去查，不许凭空编造……

完整出厂文案见 [`PERSONA.md`](./PERSONA.md)。

## 安装

本插件需要在某个 profile 里安装（桌面端默认 profile 是 `desktop`）。

**从 GitHub 仓库安装**（把 `<owner>/<repo>` 换成实际地址，pnpm 会拉取仓库 tarball，无需本机装 git）：

```powershell
& "<?? DSH ????>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add https://github.com/<owner>/<repo>/archive/refs/heads/main.tar.gz
```

**从本地目录安装**（开发调试用）：

```powershell
& "<你的 DSH 安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add link:E:\path\to\dsh-xiaojingyu-persona
```

**从插件管理页安装**：Web UI 的「插件」页面 · 安装本地 bundle / 输入包目录。

装完**重启 DSH**（新 bundle 需要一次重启才会加载新的 JavaScript 模块）。

## 开关与配置

| 方式 | 位置 | 说明 |
|---|---|---|
| 启用 / 停用 | Web UI「插件」页面该插件行 | 停用后人格段落立刻消失，其余功能不受影响 |
| `enabled` | 插件设置表单 | `true`（默认）生效，`false` 关闭 |
| `persona` | 插件设置表单 | 整段替换人格文案；留空则回落出厂文案 |

手工改配置的话，在 profile 的 `cordis.patch.yml` 里按 id 覆盖（**按 id 覆盖会整体替换 config，字段要写全**）：

```yaml
- id: xiaojingyu-persona
  name: 'dsh-xiaojingyu-persona'
  config:
    enabled: true
    persona: |
      你是一只傲娇小鲸鱼……
```

## 工作原理（以及为什么不是「新增一个段」）

很多插件会注册一个**新段名**来注入人格，但在按段名白名单收敛提示词的 agent preset 下（例如 `@linxin666/dsh-liangshen` 的 `minimal-prompt` 只保留 `deployment:persona-prefix` / `deployment:persona` / `persona` / `plan:policy` / `tools:*`），自定义段会被静默过滤掉——插件看起来「装了没效果」。

所以本插件的做法是：挂 `system-prompt/assemble`（`prepend: true`，拿到最终段列表），把人格文本**追加进已经存在、且必然被保留的 persona 段**；若某份 preset 完全没有 persona 段，则补一个名为 `persona` 的兜底段。

顺带一提：追加不会动工具指导、runtime context、协作监听器等其它段，因此「越狱式」丢失能力的风险不存在——人格只改口气。

### 这是一次有理由的偏离

DSH 官方插件开发指引（`cordis-plugin-development/references/practices.md`）建议用 `ctx.systemPrompt.section()` 注册段，并明确劝阻监听 `system-prompt/assemble` 去增删文本。本插件仍然选择后者，原因实测：`section()` 注册的**新段名**会被「按段名白名单收敛提示词」的 preset 直接过滤掉（例如 `dsh-liangshen` 的 `minimal-prompt` 只保留 `deployment:persona-prefix` / `deployment:persona` / `persona` / `plan:policy` / `tools:*`）——那样插件会「装了没效果」。两害相权，选可用的那个，并把偏离写在这里。

## 卸载

```powershell
& "<你的 DSH 安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop remove dsh-xiaojingyu-persona
```

或在插件管理页里移除该 bundle，然后重启。

## 开发

- 入口 `index.js`：`apply(ctx, config)` + `Config`（schemastery）。纯函数 `appendPersona()` 可离线单测。
- 语法自检：`node --check index.js`。
- 依赖只有 `@deepseek-ai/schemastery`（宿主已自带同名包，安装时会正常解析）。

## 兼容性

- 需要 DSH `>= 0.2.0-rc.2`（`dsh-persona` 段的段名与 `system-prompt/assemble` 事件在本版可用）。
- 与 `dsh-persona`（preset 内人设行）、`dsh-cosplay` 可共存：本插件不注册新段、不改段名，只把文本追加进 persona 段。
- 若同时装了别的也挂 `system-prompt/assemble` 的插件（例如 `dsh-liangshen` 的 `minimal-prompt`），谁在外层决定「工作区行 / 调度规则」与人格文本的先后次序；两种顺序都实测通过，不丢内容。

## `link:` 本地安装的一个坑

用 `dsh plugin ... add link:<目录>` 安装时，插件目录是**软链接**，Node 按真实路径解析依赖，因此它**看不到** profile 的 `node_modules`。本插件对 `@deepseek-ai/schemastery` 做了容错：解析不到时不导出 Config schema（loader 对无 schema 的插件原样放行 config），**插件照常工作，人格照常注入**，只是少了设置表单里的 `enabled` / `persona` 两个字段。

想要设置表单，二选一：

```powershell
# A. 在插件目录里装上它声明的依赖（推荐本地开发时用）
npm install --prefix <本目录绝对路径>
```

```powershell
# B. 或者改成从仓库 tarball 安装，pnpm 会自己把依赖装进 profile
dsh plugin --profile <profile> add https://github.com/<owner>/<repo>/archive/refs/tags/v1.0.1.tar.gz
```

## 已知限制

- **`complete: true` 的人设 preset 下本插件静默无效**：那种 preset 会在组装收敛之后把所有段替换成唯一的 complete 段，任何追加都会被丢弃。（本机活动 preset 不使用 complete，不受影响。）
- **自定义文案里的 `{{...}}` 会被安全化**：persona 段文本参与提示词插值，写成 `{{foo}}` 会在渲染时抛 `unknown prompt variable`，打挂该会话的每一次组装；因此注入前把 `{{` / `}}` 拆成 `{ {` / `} }`（其余文本逐字保留）。
- **`dsh.engines.dsh` 只是声明**：DSH 目前不读取该字段，真正的运行门槛是本插件用到的 `system-prompt/assemble` 与 volatile Config 行为（0.2.0-rc.2 起可用）。这里刻意**不**声明 `peerDependencies: {"@deepseek-ai/dsh": ...}`——那会把宿主整包拉进 profile 的 node_modules，反而制造 dual-package hazard。

## 许可

MIT
