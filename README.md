<p align="center">
  <img src="public/icon.png" width="88" alt="ZHITONG">
</p>

<h1 align="center">智通 ZHITONG</h1>

<p align="center">
  在一个界面里管理多个 AI 编程智能体：Claude Code、Codex、Gemini CLI……<br>
  Manage multiple AI coding agents in one place.
</p>

<p align="center">
  <a href="https://github.com/HUHANWEN09/zhitong/releases/latest"><b>⬇️ 下载官方版（macOS）</b></a> ·
  <a href="https://zhitong.xingyuzhitong.com">官网</a> ·
  <a href="#english">English</a>
</p>

---

同时开着好几个 AI 编程智能体，终端窗口一多就乱？智通把它们收进一个网页：按项目分组，每个线程是一个独立终端，点一下就切换，底部输入框直接发话。

这个仓库是**社区版**：开源、免费、不用注册，代码精简，适合自己改造。想要开箱即用的完整体验，请下载**官方版**。

## 社区版和官方版

| | 社区版（本仓库） | 官方版 |
|---|:---:|:---:|
| 支持的智能体 | Claude Code、Codex、Gemini CLI | Claude Code、Codex、Antigravity（反重力）、Grok |
| 一屏管理多个智能体终端 | ✅ | ✅ |
| 按项目、线程组织，随时切换 | ✅ | ✅ |
| 输入框发送、常用按键 | ✅ | ✅ |
| 查看本机已装的技能 | ✅ | ✅ |
| 中文 / English 界面 | ✅ | ✅ |
| 原生 Mac 应用，装好就能用 | | ✅ |
| 语音输入（本机识别） | | ✅ |
| 项目线程记忆：换模型、重开会话也能接着干 | | ✅ |
| 技能广场：一键安装审核过的技能 | 入口 | ✅ |
| 手机远程访问 | | ✅ |
| 内容分发技能：让 AI 自动发布到各平台 | | 即将上线 |
| 自动更新 | | ✅ |

官方版有免费版，注册 ZHITONG 账号即可使用；部分功能需要会员。👉 [下载官方版](https://github.com/HUHANWEN09/zhitong/releases/latest)

## 快速开始（社区版）

需要 macOS 或 Linux、Node.js 18 以上、tmux 和 ttyd。

```bash
# macOS
brew install tmux ttyd

git clone https://github.com/HUHANWEN09/zhitong.git
cd zhitong
node server.js
```

浏览器打开 <http://127.0.0.1:47690>，点「添加项目」选一个文件夹，再在项目下新建线程。

至少装一个智能体命令行：

| 智能体 | 安装 |
|---|---|
| Claude Code | `npm install -g @anthropic-ai/claude-code` |
| Codex | `npm install -g @openai/codex` |
| Gemini CLI | `npm install -g @google/gemini-cli` |

没装的会在新建线程时显示为不可选，不影响其他功能。

## 工作原理

- 所有智能体跑在同一个 tmux 会话（`zhitong-community`）的不同窗口里，关掉网页也不会中断。
- 网页里的终端由 [ttyd](https://github.com/tsl0922/ttyd) 显示。
- 关掉的线程再点开，会自动接回这个目录里最近一次对话（Claude Code 用 `--continue`，Codex 用 `resume --last`）。
- 项目和线程列表保存在 `~/Library/Application Support/ZHITONG-Community/`（Linux 为 `~/.config/zhitong-community/`）。

可用环境变量调整：`ZHITONG_PORT`（默认 47690，终端用下一个端口）、`ZHITONG_DATA_DIR`、`ZHITONG_TMUX_SESSION`。

## 安全

智通能在你的终端里执行命令，所以默认只对本机开放：

- 只监听 `127.0.0.1`，不对局域网开放；
- 校验 Host 和 Origin，挡住 DNS 重绑定和别的网页跨站调用；
- 写操作必须带自定义请求头；
- 终端地址每次启动随机生成，ttyd 开启来源检查。

请不要把端口转发到公网。发现安全问题，请通过 [GitHub 私密报告](https://github.com/HUHANWEN09/zhitong/security/advisories/new) 告诉我们，不要公开提 Issue。

## 参与

欢迎提 Issue 和 Pull Request。社区版保持精简，新功能请先开 Issue 讨论。

## 许可证与商标

代码以 [MIT 许可证](LICENSE) 开源，你可以自由使用、修改和分发。

「智通」「ZHITONG」名称和图标不在 MIT 授权范围内。基于本项目修改的版本请使用别的名字，不要自称官方版。

---

<a id="english"></a>

## English

**ZHITONG** puts all your AI coding agents (Claude Code, Codex, Gemini CLI, …) into one web panel. Group them by project, give each thread its own terminal, switch with one click, and send messages from a single input box.

This repository is the **Community Edition**: open source, free, no sign-up, small enough to hack on. It supports Claude Code, Codex and Gemini CLI; the official app supports Claude Code, Codex, Antigravity and Grok. For the full experience, get the **official app**: native macOS app, voice input, project and thread memory, a one-click skills marketplace, remote access from your phone, and auto-update. It has a free plan; some features need a membership.

👉 [Download the official app](https://github.com/HUHANWEN09/zhitong/releases/latest)

### Quick start

Requires macOS or Linux, Node.js 18+, tmux and ttyd.

```bash
brew install tmux ttyd      # macOS
git clone https://github.com/HUHANWEN09/zhitong.git
cd zhitong && node server.js
```

Open <http://127.0.0.1:47690>, add a project folder, then create a thread with the agent you want.

### Security

ZHITONG can run commands in your terminals, so it only listens on `127.0.0.1`, checks Host and Origin headers, requires a custom header for write requests, and uses a random terminal path with origin checks on every start. Do not expose the port to the internet. Please report security issues privately via [GitHub Security Advisories](https://github.com/HUHANWEN09/zhitong/security/advisories/new).

### License and trademark

Code is released under the [MIT License](LICENSE). The names "智通" and "ZHITONG" and the logo are not covered by the license; please use a different name for modified versions and do not present them as the official app.
