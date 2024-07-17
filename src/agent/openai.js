/* eslint-disable no-unused-vars */
import {Context} from '../config/context.js';

import {requestChatCompletions} from "./request.js";


/**
 * @param {Context} context
 * @return {string|null}
 */
function openAIKeyFromContext(context) {
    const length = context.USER_CONFIG.OPENAI_API_KEY.length
    return context.USER_CONFIG.OPENAI_API_KEY[Math.floor(Math.random() * length)];
}


/**
 * @param {Context} context
 * @return {boolean}
 */
export function isOpenAIEnable(context) {
    return context.USER_CONFIG.OPENAI_API_KEY.length > 0;
}


/**
 * 发送消息到ChatGPT
 *
 * @param {string} message
 * @param {Array} history
 * @param {Context} context
 * @param {function} onStream
 * @return {Promise<string>}
 */
export async function requestCompletionsFromOpenAI(message, history, context, onStream) {
    const url = `${context.USER_CONFIG.OPENAI_API_BASE}/chat/completions`;

    const body = {
        model: context.USER_CONFIG.OPENAI_CHAT_MODEL,
        ...context.USER_CONFIG.OPENAI_API_EXTRA_PARAMS,
        messages: [...(history || []), {role: 'user', content: message}],
        stream: onStream != null,
    };

    const header = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIKeyFromContext(context)}`,
    };

    return requestChatCompletions(url, header, body, context, onStream);
}


/**
 * 请求Openai生成图片
 *
 * @param {string} prompt
 * @param {Context} context
 * @return {Promise<string>}
 */
export async function requestImageFromOpenAI(prompt, context) {
    const url = `${context.USER_CONFIG.OPENAI_API_BASE}/images/generations`;
    const header = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIKeyFromContext(context)}`,
    };
    const body = {
        prompt: prompt,
        n: 1,
        size: context.USER_CONFIG.DALL_E_IMAGE_SIZE,
        model: context.USER_CONFIG.DALL_E_MODEL,
    };
    if (body.model === 'dall-e-3') {
        body.quality = context.USER_CONFIG.DALL_E_IMAGE_QUALITY;
        body.style = context.USER_CONFIG.DALL_E_IMAGE_STYLE;
    }
    const resp = await fetch(url, {
        method: 'POST',
        headers: header,
        body: JSON.stringify(body),
    }).then((res) => res.json());

    if (resp.error?.message) {
        throw new Error(resp.error.message);
    }
    return resp?.data?.[0]?.url;
}


