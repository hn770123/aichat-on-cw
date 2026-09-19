/*
 * iOS 9 Safari で動作する AI チャット画面の制御モジュール。
 * ES5 構文、XMLHttpRequest、通常の DOM API だけで API と画面を接続する。
 */
(function () {
  "use strict";

  var state = { models: [], conversations: [], currentId: null, busy: false };
  var elements = {};

  /** ID で要素を取得する。 */
  function byId(id) { return document.getElementById(id); }

  /** API エラーまたは通信エラーを日本語メッセージへ変換する。 */
  function errorMessage(xhr, data) {
    if (data && data.error && data.error.message) { return data.error.message; }
    if (xhr.status === 0) { return "通信できません。接続を確認してもう一度お試しください。"; }
    return "処理に失敗しました。もう一度お試しください。";
  }

  /** XMLHttpRequest で JSON API を呼び出す。 */
  function api(method, path, body, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, path, true);
    xhr.setRequestHeader("Accept", "application/json");
    if (body !== null) { xhr.setRequestHeader("Content-Type", "application/json"); }
    xhr.onreadystatechange = function () {
      var data;
      if (xhr.readyState !== 4) { return; }
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (ignored) { data = null; }
      if (xhr.status >= 200 && xhr.status < 300) { callback(null, data); }
      else { callback(errorMessage(xhr, data), data); }
    };
    xhr.onerror = function () { callback("通信できません。接続を確認してもう一度お試しください。", null); };
    xhr.send(body === null ? null : JSON.stringify(body));
  }

  /** 処理中状態を切り替え、二重操作を防ぐ。 */
  function setBusy(busy, message) {
    var controls = document.querySelectorAll("button, select, textarea");
    var index;
    state.busy = busy;
    for (index = 0; index < controls.length; index += 1) { controls[index].disabled = busy; }
    elements.status.textContent = message || "";
  }

  /** エラー表示を更新する。 */
  function showError(message) { elements.error.textContent = message || ""; }

  /** ISO 日時を古い Safari でも読める形式へ変換して表示する。 */
  function formatDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) { date = new Date(value.replace(/-/g, "/").replace("T", " ").replace("Z", " UTC")); }
    return isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  /** モデル ID に対応する表示名を返す。 */
  function modelName(id) {
    var index;
    for (index = 0; index < state.models.length; index += 1) {
      if (state.models[index].id === id) { return state.models[index].name; }
    }
    return id;
  }

  /** 会話履歴を安全な textContent で描画する。 */
  function renderHistory() {
    var index, item, button, title, meta;
    while (elements.historyList.firstChild) { elements.historyList.removeChild(elements.historyList.firstChild); }
    elements.historyEmpty.hidden = state.conversations.length !== 0;
    for (index = 0; index < state.conversations.length; index += 1) {
      item = document.createElement("li");
      button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      button.setAttribute("data-id", state.conversations[index].id);
      title = document.createElement("strong");
      title.textContent = state.conversations[index].title;
      meta = document.createElement("span");
      meta.textContent = formatDate(state.conversations[index].updatedAt);
      button.appendChild(title); button.appendChild(meta); item.appendChild(button); elements.historyList.appendChild(item);
    }
  }

  /** メッセージ一覧を利用者と AI に分けて描画する。 */
  function renderMessages(messages) {
    var index, article, role, content;
    while (elements.messages.firstChild) { elements.messages.removeChild(elements.messages.firstChild); }
    for (index = 0; index < messages.length; index += 1) {
      article = document.createElement("article");
      article.className = "message " + messages[index].role;
      role = document.createElement("span"); role.className = "role";
      role.textContent = messages[index].role === "user" ? "あなた" : "AI";
      content = document.createElement("span"); content.textContent = messages[index].content;
      article.appendChild(role); article.appendChild(content); elements.messages.appendChild(article);
    }
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  /** 新規会話設定フォームを表示する。 */
  function showNewForm() {
    state.currentId = null; showError("");
    elements.welcome.hidden = true; elements.conversationPanel.hidden = true; elements.newPanel.hidden = false;
    elements.modelSelect.focus();
  }

  /** 保存済み会話を読み込み、設定とメッセージを表示する。 */
  function openConversation(id) {
    if (state.busy) { return; }
    setBusy(true, "会話を読み込んでいます…"); showError("");
    api("GET", "/api/conversations/" + encodeURIComponent(id), null, function (error, data) {
      setBusy(false, "");
      if (error) { showError(error); return; }
      state.currentId = id;
      elements.newPanel.hidden = true; elements.welcome.hidden = true; elements.conversationPanel.hidden = false;
      elements.conversationTitle.textContent = data.conversation.title;
      elements.conversationModel.textContent = "使用モデル: " + modelName(data.conversation.aiModel);
      elements.currentPrompt.value = data.conversation.systemPrompt;
      renderMessages(data.messages);
    });
  }

  /** 履歴一覧を再取得し、必要なら最新会話を開く。 */
  function loadHistory(openLatest) {
    api("GET", "/api/conversations", null, function (error, data) {
      if (error) { showError(error); return; }
      state.conversations = data.conversations; renderHistory();
      if (openLatest && state.conversations.length) { openConversation(state.conversations[0].id); }
      else if (openLatest) { showNewForm(); }
    });
  }

  /** モデル設定を取得し、選択欄と既定プロンプトを準備する。 */
  function loadModels(callback) {
    api("GET", "/api/models", null, function (error, data) {
      var index, option;
      if (error) { showError(error); return; }
      state.models = data.models;
      for (index = 0; index < data.models.length; index += 1) {
        option = document.createElement("option"); option.value = data.models[index].id; option.textContent = data.models[index].name;
        elements.modelSelect.appendChild(option);
      }
      elements.modelSelect.value = data.defaultModel;
      elements.systemPrompt.value = data.defaultSystemPrompt;
      elements.systemPrompt.maxLength = data.maxSystemPromptLength;
      elements.promptHelp.textContent = "最大 " + data.maxSystemPromptLength + " 文字。秘密情報は入力しないでください。";
      callback();
    });
  }

  /** 新規会話設定フォームを送信する。 */
  function createConversation(event) {
    event.preventDefault(); if (state.busy) { return; }
    setBusy(true, "会話を作成しています…"); showError("");
    api("POST", "/api/conversations", { model: elements.modelSelect.value, systemPrompt: elements.systemPrompt.value }, function (error, data) {
      setBusy(false, "");
      if (error) { showError(error); return; }
      loadHistory(false); openConversation(data.conversation.id);
    });
  }

  /** 現在の会話へメッセージを送る。失敗時は入力を保持する。 */
  function sendMessage(event) {
    var content = elements.messageInput.value;
    event.preventDefault(); if (state.busy || !state.currentId || !content.replace(/^\s+|\s+$/g, "")) { return; }
    setBusy(true, "AI が回答を作成しています…"); showError("");
    api("POST", "/api/conversations/" + encodeURIComponent(state.currentId) + "/messages", { content: content }, function (error) {
      setBusy(false, "");
      if (error) { showError(error); return; }
      elements.messageInput.value = ""; openConversation(state.currentId); loadHistory(false);
    });
  }

  /** 確認後に現在の会話を削除する。 */
  function deleteConversation() {
    if (state.busy || !state.currentId || !window.confirm("この会話を削除しますか？この操作は取り消せません。")) { return; }
    setBusy(true, "会話を削除しています…"); showError("");
    api("DELETE", "/api/conversations/" + encodeURIComponent(state.currentId), null, function (error) {
      setBusy(false, "");
      if (error) { showError(error); return; }
      state.currentId = null; elements.conversationPanel.hidden = true; elements.welcome.hidden = false; loadHistory(true);
    });
  }

  /** DOM 参照とイベントを初期化し、モデルと履歴を読み込む。 */
  function initialize() {
    var ids = ["history-toggle", "new-chat", "history-panel", "history-empty", "history-list", "new-conversation-panel", "new-conversation-form", "model-select", "system-prompt", "prompt-help", "cancel-new", "conversation-panel", "conversation-title", "conversation-model", "current-prompt", "messages", "message-form", "message-input", "delete-chat", "welcome", "status", "error"];
    var names = ["historyToggle", "newChat", "historyPanel", "historyEmpty", "historyList", "newPanel", "newForm", "modelSelect", "systemPrompt", "promptHelp", "cancelNew", "conversationPanel", "conversationTitle", "conversationModel", "currentPrompt", "messages", "messageForm", "messageInput", "deleteChat", "welcome", "status", "error"];
    var index;
    for (index = 0; index < ids.length; index += 1) { elements[names[index]] = byId(ids[index]); }
    elements.newChat.onclick = showNewForm;
    elements.cancelNew.onclick = function () { elements.newPanel.hidden = true; elements.welcome.hidden = state.currentId !== null; if (state.currentId) { elements.conversationPanel.hidden = false; } };
    elements.historyToggle.onclick = function () { var hidden = !elements.historyPanel.hidden; elements.historyPanel.hidden = hidden; elements.historyToggle.setAttribute("aria-expanded", hidden ? "false" : "true"); };
    elements.historyList.onclick = function (event) { var node = event.target; while (node && node !== elements.historyList && !node.getAttribute("data-id")) { node = node.parentNode; } if (node && node.getAttribute("data-id")) { openConversation(node.getAttribute("data-id")); } };
    elements.newForm.onsubmit = createConversation; elements.messageForm.onsubmit = sendMessage; elements.deleteChat.onclick = deleteConversation;
    loadModels(function () { loadHistory(true); });
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", initialize); } else { initialize(); }
}());
