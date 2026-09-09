(function () {
  const form = document.getElementById('notify-form');
  const message = document.getElementById('notify-message');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const consent = document.getElementById('consent').checked;
    const company = document.getElementById('company').value;

    if (!email) {
      message.textContent = 'Enter an email address first.';
      message.dataset.state = 'error';
      return;
    }
    if (!consent) {
      message.textContent = 'Please tick the consent checkbox.';
      message.dataset.state = 'error';
      return;
    }

    message.textContent = 'Sending…';
    message.dataset.state = '';

    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent, company }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        message.textContent = "You're on the list. We'll be in touch at launch.";
        message.dataset.state = 'ok';
        form.reset();
      } else {
        message.textContent = data.error || 'Something went wrong. Try again shortly.';
        message.dataset.state = 'error';
      }
    } catch (err) {
      message.textContent = 'Network error — try again shortly.';
      message.dataset.state = 'error';
    }
  });
})();
