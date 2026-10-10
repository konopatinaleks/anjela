const chat = document.getElementById('chat');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');

function appendMessage(text, role) {
  const bubble = document.createElement('div');
  bubble.className = `message ${role}`;
  bubble.textContent = text;
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
      body: JSON.stringify({ message })
    });

    const data = await response.json();
    appendMessage(data.reply || 'Я здесь рядом с тобой.', 'bot');
  } catch (error) {
    appendMessage('Что-то пошло не так, но я всё ещё рядом и готова продолжать диалог.', 'bot');
  } finally {
    input.disabled = false;
    input.focus();
  }
});

addWelcome();
