const chat = document.getElementById('chat');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const resetButton = document.getElementById('reset-button');
const statusLabel = document.getElementById('status-label');

const WELCOME = 'Привет. Я Anjela. Скажи, как тебя зовут — и не пытайся произвести впечатление с первой фразы.';

function getUserId() {
  let id = localStorage.getItem('anjela-user-id');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id || '')) {
    id = crypto.randomUUID();
    localStorage.setItem('anjela-user-id', id);
  }
  return id;
}

let userId = getUserId();
let pending = false;

function scrollToEnd() {
  chat.scrollTop = chat.scrollHeight;
}

async function sendFeedback(messageId, rating, controls) {
  const buttons = [...controls.querySelectorAll('button')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, messageId, rating })
    });
    if (!response.ok) throw new Error('feedback failed');
    buttons.forEach((button) => {
      button.disabled = false;
      button.classList.toggle('is-selected', Number(button.dataset.rating) === rating);
      button.setAttribute('aria-pressed', String(Number(button.dataset.rating) === rating));
    });
  } catch (error) {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function appendMessage(text, role, messageId, rating) {
  const bubble = document.createElement('div');
  bubble.className = `message ${role}`;

  const body = document.createElement('p');
  body.textContent = text;
  bubble.appendChild(body);

  if (messageId) {
    const controls = document.createElement('div');
    controls.className = 'feedback';
    [['Нравится', '👍', 1], ['Не то', '👎', -1]].forEach(([label, glyph, value]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.rating = String(value);
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(rating === value));
      button.textContent = glyph;
      if (rating === value) button.classList.add('is-selected');
      button.addEventListener('click', () => sendFeedback(messageId, value, controls));
      controls.appendChild(button);
    });
    bubble.appendChild(controls);
  }

  chat.appendChild(bubble);
  scrollToEnd();
  return bubble;
}

function setPending(isPending) {
  pending = isPending;
  input.disabled = isPending;
  sendButton.disabled = isPending;
  statusLabel.textContent = isPending ? 'Печатает…' : 'Сейчас здесь';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || pending) return;

  appendMessage(message, 'user');
  input.value = '';
  setPending(true);
  const typing = appendMessage('…', 'bot typing');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, userId })
    });
    const data = await response.json().catch(() => ({}));
    typing.remove();
    if (!response.ok) {
      appendMessage(data.error || 'Сейчас не получается ответить. Попробуй ещё раз.', 'bot');
      return;
    }
    appendMessage(data.reply || 'Я здесь.', 'bot', data.messageId);
  } catch (error) {
    typing.remove();
    appendMessage('Связь оборвалась. Я никуда не делась — напиши ещё раз.', 'bot');
  } finally {
    setPending(false);
    input.focus();
  }
});

resetButton.addEventListener('click', async () => {
  if (!window.confirm('Стереть память этого чата? Это нельзя отменить.')) return;
  resetButton.disabled = true;
  try {
    const response = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!response.ok) throw new Error('reset failed');
  } catch (error) {
    resetButton.disabled = false;
    return;
  }
  localStorage.removeItem('anjela-user-id');
  window.location.reload();
});

async function boot() {
  try {
    const response = await fetch(`/api/history?userId=${encodeURIComponent(userId)}`);
    const data = await response.json();
    const messages = Array.isArray(data.messages) ? data.messages : [];
    if (!messages.length) {
      appendMessage(WELCOME, 'bot');
      return;
    }
    messages.forEach((message) => {
      appendMessage(
        message.content,
        message.role === 'user' ? 'user' : 'bot',
        message.role === 'assistant' ? message.id : null,
        message.rating
      );
    });
  } catch (error) {
    appendMessage(WELCOME, 'bot');
  }
}

boot();
