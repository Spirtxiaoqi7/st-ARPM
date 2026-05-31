# ARPM Story Cleaner

SillyTavern third-party extension for ARPM three-stage replies.

It rewrites chat-completion request history right before the request is sent:

- keeps final `<response>` text as the visible story/history content
- extracts relationship information from `<state_update>` as a compact note
- removes `<analysis>` so hidden per-turn guidance does not leak back into later prompts

The extension does not edit chat logs or the visible frontend messages. It only mutates `generate_data.messages` during `CHAT_COMPLETION_SETTINGS_READY`.

## Install

Install this repository as a SillyTavern third-party extension, or copy the folder to:

```text
SillyTavern/public/scripts/extensions/third-party/st-arpm-story-cleaner
```

Restart or reload SillyTavern, then enable **ARPM Story Cleaner** in extensions.

## Behavior

Input history message:

```text
<state_update>{"has_state_change":true,"state_type":"relationship","target":"用户与女朋友","event_type":"breakup","new_status":"已分手","update_action":"update","evidence":"我分手了"}</state_update>
<analysis>保持克制。</analysis>
<response>我听见你说完后，沉默了一会儿。</response>
```

Prompt history sent to the model:

```text
[关系状态]
用户与女朋友 = 已分手
event_type: breakup
update_action: update
evidence: 我分手了

我听见你说完后，沉默了一会儿。
```
