window.Feud = {
  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  },
  clone(value) {
    return JSON.parse(JSON.stringify(value));
  },
  countdown(deadline, element) {
    if (!deadline) {
      element.textContent = '0';
      return;
    }
    element.textContent = String(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  },
  setConnection(element, online) {
    element.classList.toggle('is-online', online);
    element.innerHTML = `<i></i> ${online ? 'Connected' : 'Reconnecting'}`;
  }
};