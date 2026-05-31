import { extension_settings } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';

export const extensionName = 'st-arpm-story-cleaner';
const settingsKey = extensionName;

const defaultSettings = {
    enabled: true,
    includeRelationship: true,
    stripAnalysis: true,
    debug: false,
    lastRun: {
        cleanedMessages: 0,
        relationshipNotes: 0,
    },
};

function ensureSettings() {
    extension_settings[settingsKey] = extension_settings[settingsKey] || {};
    const settings = extension_settings[settingsKey];

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) {
            settings[key] = structuredClone(value);
        }
    }

    settings.lastRun = settings.lastRun || structuredClone(defaultSettings.lastRun);
    return settings;
}

function extractTag(text, tagName) {
    if (typeof text !== 'string') {
        return '';
    }

    const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = text.match(pattern);
    return match ? match[1].trim() : '';
}

function stripTag(text, tagName) {
    if (typeof text !== 'string') {
        return '';
    }

    const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi');
    return text.replace(pattern, '').trim();
}

function parseStateUpdate(rawState) {
    if (!rawState) {
        return null;
    }

    try {
        return JSON.parse(rawState);
    } catch {
        return null;
    }
}

function formatRelationshipNote(state) {
    if (!state || state.state_type !== 'relationship') {
        return '';
    }

    const hasUsefulStatus = state.has_state_change === true || state.update_action === 'update' || state.update_action === 'pending_confirm';
    if (!hasUsefulStatus) {
        return '';
    }

    const target = String(state.target || '').trim();
    const status = String(state.new_status || '').trim();
    const eventType = String(state.event_type || '').trim();
    const action = String(state.update_action || '').trim();
    const evidence = String(state.evidence || '').trim();

    const parts = [];
    if (target || status) {
        parts.push(`${target || '关系状态'}${status ? ` = ${status}` : ''}`);
    }
    if (eventType && eventType !== 'none') {
        parts.push(`event_type: ${eventType}`);
    }
    if (action && action !== 'ignore') {
        parts.push(`update_action: ${action}`);
    }
    if (evidence) {
        parts.push(`evidence: ${evidence}`);
    }

    return parts.length ? `[关系状态]\n${parts.join('\n')}` : '';
}

export function cleanArpmMessageContent(content, options = {}) {
    const settings = {
        includeRelationship: true,
        stripAnalysis: true,
        ...options,
    };

    if (typeof content !== 'string' || !/<(?:state_update|analysis|response)\b/i.test(content)) {
        return {
            content,
            changed: false,
            relationshipIncluded: false,
        };
    }

    const response = extractTag(content, 'response');
    const rawState = extractTag(content, 'state_update');
    const relationshipNote = settings.includeRelationship
        ? formatRelationshipNote(parseStateUpdate(rawState))
        : '';

    let cleaned = response || content;
    cleaned = stripTag(cleaned, 'analysis');
    cleaned = stripTag(cleaned, 'state_update');
    cleaned = stripTag(cleaned, 'response');
    cleaned = cleaned.trim();

    if (relationshipNote) {
        cleaned = `${relationshipNote}\n\n${cleaned}`.trim();
    }

    return {
        content: cleaned,
        changed: cleaned !== content,
        relationshipIncluded: Boolean(relationshipNote),
    };
}

export function cleanChatCompletionMessages(messages, options = {}) {
    if (!Array.isArray(messages)) {
        return {
            cleanedMessages: 0,
            relationshipNotes: 0,
        };
    }

    let cleanedMessages = 0;
    let relationshipNotes = 0;

    for (const message of messages) {
        if (!message || typeof message.content !== 'string') {
            continue;
        }

        const result = cleanArpmMessageContent(message.content, options);
        if (result.changed) {
            message.content = result.content;
            cleanedMessages += 1;
        }
        if (result.relationshipIncluded) {
            relationshipNotes += 1;
        }
    }

    return { cleanedMessages, relationshipNotes };
}

function updateStatus() {
    const settings = ensureSettings();
    const status = $('#arpm_story_cleaner_status');
    if (!status.length) {
        return;
    }

    const lastRun = settings.lastRun || defaultSettings.lastRun;
    status.text(`上次清洗 ${lastRun.cleanedMessages || 0} 条消息，保留 ${lastRun.relationshipNotes || 0} 条关系状态。`);
}

function renderSettings() {
    const settings = ensureSettings();
    const html = `
        <div id="arpm_story_cleaner_settings" class="arpm-story-cleaner-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>ARPM Story Cleaner</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label class="checkbox_label">
                        <input id="arpm_story_cleaner_enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}>
                        <span>启用三段式历史清洗</span>
                    </label>
                    <label class="checkbox_label">
                        <input id="arpm_story_cleaner_relationship" type="checkbox" ${settings.includeRelationship ? 'checked' : ''}>
                        <span>保留关系状态摘要</span>
                    </label>
                    <label class="checkbox_label">
                        <input id="arpm_story_cleaner_debug" type="checkbox" ${settings.debug ? 'checked' : ''}>
                        <span>控制台输出调试信息</span>
                    </label>
                    <small class="notes">
                        请求发送前清洗 chat completion messages：历史里的 &lt;analysis&gt; 不再进入 prompt，&lt;response&gt; 会作为正文保留，&lt;state_update&gt; 只提取 relationship 摘要。
                    </small>
                    <div id="arpm_story_cleaner_status" class="marginTop5 text_muted"></div>
                </div>
            </div>
        </div>`;

    $('#extensions_settings').append(html);

    $('#arpm_story_cleaner_enabled').on('change', function () {
        settings.enabled = Boolean(this.checked);
        saveSettingsDebounced();
    });

    $('#arpm_story_cleaner_relationship').on('change', function () {
        settings.includeRelationship = Boolean(this.checked);
        saveSettingsDebounced();
    });

    $('#arpm_story_cleaner_debug').on('change', function () {
        settings.debug = Boolean(this.checked);
        saveSettingsDebounced();
    });

    updateStatus();
}

function onChatCompletionSettingsReady(generateData) {
    const settings = ensureSettings();
    if (!settings.enabled || !generateData || !Array.isArray(generateData.messages)) {
        return;
    }

    const stats = cleanChatCompletionMessages(generateData.messages, {
        includeRelationship: settings.includeRelationship,
        stripAnalysis: settings.stripAnalysis,
    });

    settings.lastRun = stats;
    updateStatus();

    if (settings.debug && stats.cleanedMessages > 0) {
        console.info(`[${extensionName}] cleaned ${stats.cleanedMessages} messages, relationship notes: ${stats.relationshipNotes}`);
    }
}

function registerHooks() {
    eventSource.on(event_types.CHAT_COMPLETION_SETTINGS_READY, onChatCompletionSettingsReady);
}

jQuery(async () => {
    ensureSettings();
    renderSettings();
    registerHooks();
});
