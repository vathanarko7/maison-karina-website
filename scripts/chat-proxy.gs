// ============================================================
// MAISON KARINA - Chat Proxy (Google Apps Script)
//
// PURPOSE:
// - Keep Groq API key private (stored in Script Properties)
// - Accept chat requests from frontend
// - Return short assistant replies
//
// SETUP:
// 1) Create a NEW Apps Script project just for chat proxy.
// 2) Paste this file as Code.gs.
// 3) Project Settings -> Script properties:
//      GROQ_API_KEY = your Groq API key
//      GROQ_MODEL = llama-3.1-8b-instant (optional override)
// 4) Deploy -> New deployment -> Web app
//      Execute as: Me
//      Who has access: Anyone
// 5) Copy Web App URL and paste into:
//      index.html -> const CHAT_PROXY_URL = '...';
// ============================================================

var CHAT_CONFIG = {
  MODEL: 'llama-3.1-8b-instant',
  MAX_OUTPUT_TOKENS: 220,
  TEMPERATURE: 0.6,
  MAX_HISTORY: 8
};

var DEFAULT_SYSTEM_PROMPT =
  'You are the Atelier Assistant for Maison Karina. ' +
  'Reply in the same language as the user (English or Khmer only). ' +
  'Keep replies concise: maximum 2 sentences. ' +
  'Always guide users toward booking a consultation when relevant.';

function doGet() {
  var config = getChatConfig();
  return jsonResponse({
    status: 'ok',
    service: 'maison-karina-chat-proxy',
    provider: 'groq',
    model: config.MODEL
  });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : '{}');
    var config = getChatConfig();

    var incomingContents = Array.isArray(body.contents) ? body.contents : [];
    var contents = incomingContents.slice(-config.MAX_HISTORY);
    if (!contents.length) throw new Error('Missing chat contents.');

    var systemPrompt = String(body.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim();
    if (!systemPrompt) systemPrompt = DEFAULT_SYSTEM_PROMPT;

    var payload = {
      model: config.MODEL,
      messages: toGroqMessages(contents, systemPrompt),
      max_completion_tokens: config.MAX_OUTPUT_TOKENS,
      temperature: config.TEMPERATURE
    };

    var url = 'https://api.groq.com/openai/v1/chat/completions';

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + config.API_KEY
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var statusCode = response.getResponseCode();
    var raw = response.getContentText() || '{}';
    var data = {};
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      throw new Error('Invalid Groq response payload.');
    }

    if (statusCode >= 400 || (data && data.error)) {
      var apiMsg = (data && data.error && data.error.message) ? data.error.message : ('HTTP ' + statusCode);
      throw new Error(apiMsg);
    }

    var choices = data && data.choices ? data.choices : [];
    var choice = choices[0] || {};
    var message = choice.message || {};
    var reply = normalizeGroqContent(message.content);

    if (!reply) {
      var finishReason = choice.finish_reason ? String(choice.finish_reason) : '';
      if (finishReason === 'length') {
        throw new Error('Model output was truncated by token limits. Increase MAX_OUTPUT_TOKENS.');
      }
      throw new Error('Groq returned no text reply.');
    }

    return jsonResponse({
      status: 'success',
      reply: reply,
      provider: 'groq',
      model: config.MODEL
    });
  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: String((err && err.message) ? err.message : err)
    });
  }
}

function getChatConfig() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = String(props.getProperty('GROQ_API_KEY') || '').trim();
  var model = String(props.getProperty('GROQ_MODEL') || CHAT_CONFIG.MODEL).trim();

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is missing in Script Properties.');
  }

  return {
    API_KEY: apiKey,
    MODEL: model || CHAT_CONFIG.MODEL,
    MAX_OUTPUT_TOKENS: CHAT_CONFIG.MAX_OUTPUT_TOKENS,
    TEMPERATURE: CHAT_CONFIG.TEMPERATURE,
    MAX_HISTORY: CHAT_CONFIG.MAX_HISTORY
  };
}

function toGroqMessages(contents, systemPrompt) {
  var messages = [];

  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  contents.forEach(function (item) {
    var role = normalizeGroqRole(item && item.role);
    var content = extractPartsText(item && item.parts);
    if (!role || !content) return;
    messages.push({
      role: role,
      content: content
    });
  });

  return messages;
}

function normalizeGroqRole(role) {
  var value = String(role || '').toLowerCase().trim();
  if (value === 'user' || value === 'assistant' || value === 'system') return value;
  if (value === 'model') return 'assistant';
  return '';
}

function extractPartsText(parts) {
  if (!Array.isArray(parts)) return '';
  return parts
    .map(function (part) {
      return part && part.text ? String(part.text) : '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeGroqContent(content) {
  if (typeof content === 'string') {
    return content.replace(/\s+/g, ' ').trim();
  }
  if (!Array.isArray(content)) return '';
  return content
    .map(function (part) {
      return part && part.text ? String(part.text) : '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
