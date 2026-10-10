const chat = document.getElementById('chat');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');

function getUserId() {
  let id = localStorage.getItem('anjela-user-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('anjela-user-id', id);
  }
  return id;
}

const userId = getUserId();

async function sendFeedback(messageId, rating, controls) {
  controls.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, messageId, rating })
    });
  } catch (error) {
    controls.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  }
}

function appendMessage(text, role, messageId) {
  const bubble = document.createElement('div');
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  if (messageId) {
    const controls = document.createElement('div');
    controls.className = 'feedback';
    [['👍', 1], ['👎', -1]].forEach(([label, rating]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => sendFeedback(messageId, rating, controls));
      controls.appendChild(button);
    });
    bubble.appendChild(controls);
  }
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
}

function addWelcome() {
  appendMessage('Привет, я Anjela. Напиши мне пару слов, и мы начнём лёгкий, тёплый разговор.', 'bot');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const message = input.value.trim();
  if (!message) {
    return;
  }

  appendMessage(message, 'user');
  input.value = '';
  input.disabled = true;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message, userId })
    });

    const data = await response.json();
    appendMessage(data.reply || 'Я здесь рядом с тобой.', 'bot', data.messageId);
  } catch (error) {
    appendMessage('Что-то пошло не так, но я всё ещё рядом и готова продолжать диалог.', 'bot');
  } finally {
    input.disabled = false;
    input.focus();
  }
});

addWelcome();
