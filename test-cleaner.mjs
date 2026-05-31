import assert from 'node:assert/strict';

function extractTag(text, tagName) {
    const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = text.match(pattern);
    return match ? match[1].trim() : '';
}

function stripTag(text, tagName) {
    const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi');
    return text.replace(pattern, '').trim();
}

function parseStateUpdate(rawState) {
    if (!rawState) return null;
    try {
        return JSON.parse(rawState);
    } catch {
        return null;
    }
}

function formatRelationshipNote(state) {
    if (!state || state.state_type !== 'relationship') return '';
    const hasUsefulStatus = state.has_state_change === true || state.update_action === 'update' || state.update_action === 'pending_confirm';
    if (!hasUsefulStatus) return '';
    const parts = [];
    if (state.target || state.new_status) parts.push(`${state.target || '关系状态'}${state.new_status ? ` = ${state.new_status}` : ''}`);
    if (state.event_type && state.event_type !== 'none') parts.push(`event_type: ${state.event_type}`);
    if (state.update_action && state.update_action !== 'ignore') parts.push(`update_action: ${state.update_action}`);
    if (state.evidence) parts.push(`evidence: ${state.evidence}`);
    return parts.length ? `[关系状态]\n${parts.join('\n')}` : '';
}

function cleanArpmMessageContent(content, options = {}) {
    const settings = { includeRelationship: true, stripAnalysis: true, ...options };
    if (typeof content !== 'string' || !/<(?:state_update|analysis|response)\b/i.test(content)) {
        return { content, changed: false, relationshipIncluded: false };
    }
    const response = extractTag(content, 'response');
    const rawState = extractTag(content, 'state_update');
    const relationshipNote = settings.includeRelationship ? formatRelationshipNote(parseStateUpdate(rawState)) : '';
    let cleaned = response || content;
    cleaned = stripTag(cleaned, 'analysis');
    cleaned = stripTag(cleaned, 'state_update');
    cleaned = stripTag(cleaned, 'response');
    cleaned = cleaned.trim();
    if (relationshipNote) cleaned = `${relationshipNote}\n\n${cleaned}`.trim();
    return { content: cleaned, changed: cleaned !== content, relationshipIncluded: Boolean(relationshipNote) };
}

const sample = `<state_update>{"has_state_change":true,"state_type":"relationship","target":"用户与女朋友","event_type":"breakup","new_status":"已分手","update_action":"update","evidence":"我分手了"}</state_update>
<analysis>保持克制。</analysis>
<response>我听见你说完后，沉默了一会儿。</response>`;

const result = cleanArpmMessageContent(sample);
assert.equal(result.changed, true);
assert.equal(result.relationshipIncluded, true);
assert.equal(result.content.includes('<analysis>'), false);
assert.equal(result.content.includes('保持克制'), false);
assert.equal(result.content.includes('用户与女朋友 = 已分手'), true);
assert.equal(result.content.endsWith('我听见你说完后，沉默了一会儿。'), true);

const noChange = cleanArpmMessageContent('普通消息');
assert.equal(noChange.changed, false);
assert.equal(noChange.content, '普通消息');

console.log('st-arpm-story-cleaner tests passed');
