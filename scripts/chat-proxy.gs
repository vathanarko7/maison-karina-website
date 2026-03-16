// ============================================================
// MAISON KARINA - Chat Proxy (Google Apps Script)
//
// PURPOSE:
// - Keep Gemini API key private (stored in Script Properties)
// - Accept chat requests from frontend
// - Return short assistant replies
//
// SETUP:
// 1) Create a NEW Apps Script project just for chat proxy.
// 2) Paste this file as Code.gs.
// 3) Project Settings -> Script properties:
//      GEMINI_API_KEY = your Google AI Studio API key
// 4) Deploy -> New deployment -> Web app
//      Execute as: Me
//      Who has access: Anyone
// 5) Copy Web App URL and paste into:
//      index.html -> const CHAT_PROXY_URL = '...';
// ============================================================

var CHAT_CONFIG = {
  MODEL: 'gemini-2.0-flash-lite',
  MAX_OUTPUT_TOKENS: 220,
  THINKING_BUDGET: 0,
  TEMPERATURE: 0.6,
  MAX_HISTORY: 8
};

var DEFAULT_SYSTEM_PROMPT =
  'You are the Atelier Assistant for Maison Karina. ' +
  'Reply in the same language as the user (English or Khmer only). ' +
  'Keep replies concise: maximum 2 sentences. ' +
  'Always guide users toward booking a consultation when relevant.';

function doGet() {
  return jsonResponse({
    status: 'ok',
    service: 'maison-karina-chat-proxy',
    model: CHAT_CONFIG.MODEL
  });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : '{}');
    var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is missing in Script Properties.');

    var incomingContents = Array.isArray(body.contents) ? body.contents : [];
    var contents = incomingContents.slice(-CHAT_CONFIG.MAX_HISTORY);
    if (!contents.length) throw new Error('Missing chat contents.');

    var systemPrompt = String(body.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim();
    if (!systemPrompt) systemPrompt = DEFAULT_SYSTEM_PROMPT;

    var payload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: contents,
      generationConfig: {
        maxOutputTokens: CHAT_CONFIG.MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingBudget: CHAT_CONFIG.THINKING_BUDGET },
        temperature: CHAT_CONFIG.TEMPERATURE
      }
    };

    var url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      CHAT_CONFIG.MODEL +
      ':generateContent?key=' +
      encodeURIComponent(apiKey);

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var statusCode = response.getResponseCode();
    var raw = response.getContentText() || '{}';
    var data = {};
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      throw new Error('Invalid Gemini response payload.');
    }

    if (statusCode >= 400 || (data && data.error)) {
      var apiMsg = (data && data.error && data.error.message) ? data.error.message : ('HTTP ' + statusCode);
      throw new Error(apiMsg);
    }

    var candidates = data && data.candidates ? data.candidates : [];
    var candidate = candidates[0] || {};
    var parts = (candidate.content && candidate.content.parts) ? candidate.content.parts : [];
    var reply = parts
      .map(function (p) { return (p && p.text) ? String(p.text) : ''; })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!reply) {
      var finishReason = candidate.finishReason ? String(candidate.finishReason) : '';
      if (finishReason === 'MAX_TOKENS') {
        throw new Error('Model output was truncated by token limits. Increase MAX_OUTPUT_TOKENS or keep thinkingBudget at 0.');
      }
      throw new Error('Gemini returned no text reply.');
    }

    return jsonResponse({
      status: 'success',
      reply: reply,
      model: CHAT_CONFIG.MODEL
    });
  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: String((err && err.message) ? err.message : err)
    });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
