import {
    TemplateBodyTypeForm,
    TemplateBodyTypeJson,
    TemplateInputTypeCommaSeparated,
    TemplateInputTypeJson,
    TemplateInputTypeSpaceSeparated,
    TemplateResponseTypeJson,
    TemplateResponseTypeText,
} from '../types/template.js';

const INTERPOLATE_LOOP_REGEXP = /\{\{#each\s+(\w+)\s+in\s+([\w.[\]]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
const INTERPOLATE_CONDITION_REGEXP = /\{\{#if\s+([\w.[\]]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
const INTERPOLATE_VARIABLE_REGEXP = /\{\{([\w.[\]]+)\}\}/g;

/**
 * @param {string} template
 * @param {any} data
 * @param {Function | null} formatter
 * @returns {string}
 */
function interpolate(template, data, formatter = null) {
    const evaluateExpression = (expr, localData) => {
        if (expr === '.')
            return localData['.'] ?? localData;

        try {
            return expr.split('.').reduce((value, key) => {
                if (key.includes('[') && key.includes(']')) {
                    const [arrayKey, indexStr] = key.split('[');
                    const index = Number.parseInt(indexStr, 10);
                    return value?.[arrayKey]?.[index];
                }
                return value?.[key];
            }, localData);
        } catch (error) {
            console.error(`Error evaluating expression: ${expr}`, error);
            return undefined;
        }
    };

    const processConditional = (condition, trueBlock, falseBlock, localData) => {
        const result = evaluateExpression(condition, localData);
        return result ? trueBlock : (falseBlock || '');
    };

    const processLoop = (itemName, arrayExpr, loopContent, localData) => {
        const array = evaluateExpression(arrayExpr, localData);
        if (!Array.isArray(array)) {
            console.warn(`Expression "${arrayExpr}" did not evaluate to an array`);
            return '';
        }
        return array.map((item) => {
            const itemData = { ...localData, [itemName]: item, '.': item };
            return interpolate(loopContent, itemData);
        }).join('');
    };

    const processTemplate = (tmpl, localData) => {
        tmpl = tmpl.replace(INTERPOLATE_LOOP_REGEXP, (_, itemName, arrayExpr, loopContent) =>
            processLoop(itemName, arrayExpr, loopContent, localData));

        tmpl = tmpl.replace(INTERPOLATE_CONDITION_REGEXP, (_, condition, trueBlock, falseBlock) =>
            processConditional(condition, trueBlock, falseBlock, localData));

        return tmpl.replace(INTERPOLATE_VARIABLE_REGEXP, (_, expr) => {
            const value = evaluateExpression(expr, localData);
            if (value === undefined) {
                return `{{${expr}}}`;
            }
            if (formatter) {
                return formatter(value);
            }
            return String(value);
        });
    };

    return processTemplate(template, data);
}

/**
 * @param {any} obj
 * @param {any} data
 * @returns {{}|*|string|null}
 */
function interpolateObject(obj, data) {
    if (obj === null || obj === undefined) {
        return null;
    }
    if (typeof obj === 'string') {
        return interpolate(obj, data);
    }
    if (Array.isArray(obj)) {
        return obj.map(item => interpolateObject(item, data));
    }
    if (typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = interpolateObject(value, data);
        }
        return result;
    }
    return obj;
}

/**
 * @param {RequestTemplate} template
 * @param {any} data
 * @returns {Promise<{content: string, type: string}>}
 */
export async function executeRequest(template, data) {
    const url = new URL(interpolate(template.url, data, encodeURIComponent));

    if (template.query) {
        for (const [key, value] of Object.entries(template.query)) {
            url.searchParams.append(key, interpolate(value, data));
        }
    }

    const method = template.method;
    const headers = Object.fromEntries(
        Object.entries(template.headers).map(([key, value]) => {
            return [key, interpolate(value, data)];
        }),
    );
    for (const key of Object.keys(headers)) {
        if (headers[key] === null) {
            delete headers[key];
        }
    }

    let body = null;
    if (template.body) {
        if (template.body.type === TemplateBodyTypeJson) {
            body = JSON.stringify(interpolateObject(template.body.content, data));
        } else if (template.body.type === TemplateBodyTypeForm) {
            body = new URLSearchParams();
            for (const [key, value] of Object.entries(template.body.content)) {
                body.append(key, interpolate(value, data));
            }
        } else {
            body = interpolate(template.body.content, data);
        }
    }

    const response = await fetch(url, {
        method,
        headers,
        body,
    });

    const renderOutput = async (type, temple, response) => {
        switch (type) {
            case TemplateResponseTypeText:
                return interpolate(temple, await response.text());
            case TemplateResponseTypeJson:
            default:
                return interpolate(temple, await response.json());
        }
    };
    if (!response.ok) {
        const content = await renderOutput(template.response?.error?.input_type, template.response.error?.output, response);
        return {
            type: template.response.error.output_type,
            content,
        };
    }
    const content = await renderOutput(template.response.content?.input_type, template.response.content?.output, response);
    return {
        type: template.response.content.output_type,
        content,
    };
}

/**
 * @param {string} input
 * @param {string} type
 * @returns {string | string[] | object}
 */
export function formatInput(input, type) {
    if (type === TemplateInputTypeJson) {
        return JSON.parse(input);
    } else if (type === TemplateInputTypeSpaceSeparated) {
        return input.split(/\s+/);
    } else if (type === TemplateInputTypeCommaSeparated) {
        return input.split(/\s*,\s*/);
    } else {
        return input;
    }
}
