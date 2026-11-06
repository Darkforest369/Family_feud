(() => {
  const socket = io();
  const $ = (selector) => document.querySelector(selector);
  const themeTitles = {
    default: 'Family Feud',
    christmas: 'Christmas Feud',
    easter: 'Easter Feud'
  };
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const presentationKey = 'feudPresentationCode';
  const routeRoom = () => {
    const hashQuery = window.location.hash.includes('?')
      ? window.location.hash.slice(window.location.hash.indexOf('?') + 1)
      : '';
    return new URLSearchParams(window.location.search).get('room') ||
      new URLSearchParams(hashQuery).get('room') ||
      localStorage.getItem(presentationKey) || '';
  };
  let roomCode = routeRoom().trim().toUpperCase();
  if (roomCode) localStorage.setItem(presentationKey, roomCode);
  let publicBase = window.location.origin;
  let hasJoined = false;
  let renderedQuestionText = '';

  function applyTheme(themeId) {
    const id = Object.hasOwn(themeTitles, themeId) ? themeId : 'default';
    document.documentElement.dataset.theme = id;
    document.title = themeTitles[id];
    document.querySelectorAll('[data-theme-title]').forEach((element) => {
      element.textContent = themeTitles[id];
    });
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim();
  }

  function updateJoinInfo(code) {
    $('#presentation-room-code').textContent = code;
    const joinUrl = new URL('/', publicBase || window.location.origin);
    joinUrl.searchParams.set('room', code);
    $('#presentation-join-url').href = joinUrl.toString();
    $('#presentation-join-url').textContent = joinUrl.toString();
    $('#presentation-qr-image').src = `/qr.svg?url=${encodeURIComponent(joinUrl.toString())}`;
  }

  function showError(message) {
    const error = $('#presentation-error');
    error.textContent = message;
    error.hidden = !message;
  }

  function render(state) {
    hasJoined = true;
    $('#presentation-reconnecting').hidden = true;
    showError('');
    roomCode = state.code;
    localStorage.setItem(presentationKey, roomCode);
    applyTheme(state.themeId);
    updateJoinInfo(roomCode);
    const scores = state.roundScores || { blue: 0, red: 0 };
    const roundNumber = state.session?.number ?? state.sessionNumber ?? 0;
    $('#presentation-blue-score').textContent = scores.blue;
    $('#presentation-red-score').textContent = scores.red;
    $('#presentation-round-number').textContent = roundNumber;

    if (state.session?.finalScoreShown) {
      $('#presentation-game').hidden = true;
      $('#presentation-final').hidden = false;
      const winner = scores.blue === scores.red ? 'tie' : scores.blue > scores.red ? 'blue' : 'red';
      const winnerElement = $('#presentation-winner');
      winnerElement.className = `presentation-winner${winner === 'tie' ? '' : ` ${winner}`}`;
      winnerElement.textContent = winner === 'tie'
        ? 'IT’S A TIE!'
        : `${winner.toUpperCase()} TEAM WINS!`;
      return;
    }

    $('#presentation-final').hidden = true;
    $('#presentation-game').hidden = false;
    const question = state.session?.question;
    const questionText = question?.text || 'Waiting for the host to start a question';
    const answerBoard = $('#presentation-answer-board');
    const isSameQuestion = renderedQuestionText === questionText;
    const previousRevealed = new Set(
      [...answerBoard.querySelectorAll('.presentation-answer-tile.revealed')]
        .map((tile) => tile.dataset.answerIndex)
    );
    $('#presentation-question').textContent = questionText;
    renderedQuestionText = questionText;
    answerBoard.innerHTML = (question?.answers || []).map((answer, index) => {
      const ownerClass = answer.revealedBy === 'blue' ? 'blue'
        : answer.revealedBy === 'red' ? 'red'
          : 'unmatched';
      const animateReveal = answer.revealed && isSameQuestion && !previousRevealed.has(String(index));
      const classes = answer.revealed
        ? `answer-tile presentation-answer-tile revealed ${ownerClass}${animateReveal ? ' presentation-reveal' : ''}`
        : 'answer-tile presentation-answer-tile';
      return `<div class="${classes}" data-answer-index="${index}">
        ${answer.revealed
          ? `<span class="answer-copy">${escape(answer.text)}</span><span class="answer-points">${answer.points}</span>`
          : '<span class="presentation-answer-placeholder" aria-label="Hidden answer">?</span>'}
      </div>`;
    }).join('');
  }

  function join() {
    if (!roomCode) {
      showError('Open this page with a room code, or join a room from the host page.');
      $('#presentation-reconnecting').hidden = true;
      return;
    }
    socket.emit('presentationJoin', { code: roomCode }, (result) => {
      if (!result?.ok) {
        hasJoined = false;
        $('#presentation-reconnecting').hidden = true;
        showError(result?.error || 'Could not join this room.');
        return;
      }
      if (result.state) render(result.state);
    });
  }

  fetch('/config')
    .then((response) => {
      if (!response.ok) throw new Error('Could not load public URL settings.');
      return response.json();
    })
    .then((config) => {
      if (config.publicUrl) publicBase = config.publicUrl;
      if (roomCode) updateJoinInfo(roomCode);
    })
    .catch((error) => console.error(error));

  $('#presentation-copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#presentation-join-url').href);
      $('#presentation-copy-status').textContent = 'Copied';
    } catch (error) {
      $('#presentation-copy-status').textContent = `Could not copy: ${error.message}`;
    }
  });
  socket.on('presentationState', render);
  socket.on('connect', () => {
    $('#presentation-reconnecting').hidden = false;
    join();
  });
  socket.on('disconnect', () => {
    $('#presentation-reconnecting').hidden = false;
  });
  socket.on('connect_error', () => {
    $('#presentation-reconnecting').hidden = false;
    if (!hasJoined) showError('Unable to connect. Retrying…');
  });
  if (!roomCode) showError('Open this page with a room code, or join a room from the host page.');
})();
