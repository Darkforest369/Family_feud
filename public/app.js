(() => {
  const socket = io();
  const $ = (selector) => document.querySelector(selector);
  const THEMES = {
    default: {
      id: 'default', name: 'Default', title: 'Family Feud',
      colors: {
        bg: '#FFF8DC', text: '#2E4057', primary: '#F4A261', accent: '#F4A261',
        teamBlue: '#2E7DD1', teamRed: '#D13B3B'
      }
    },
    christmas: {
      id: 'christmas', name: 'Christmas', title: 'Christmas Feud',
      colors: {
        bg: '#0B3D2E', text: '#FFFDF4', primary: '#C8102E', accent: '#FFD700',
        teamBlue: '#2E7DD1', teamRed: '#D13B3B'
      }
    },
    easter: {
      id: 'easter', name: 'Easter', title: 'Easter Feud',
      colors: {
        bg: '#FCE4EC', text: '#2E4057', primary: '#9C27B0', accent: '#8BC34A',
        teamBlue: '#64B5F6', teamRed: '#EF9A9A'
      }
    }
  };
  const warnedThemes = new Set();
  function getTheme(themeId) {
    if (Object.hasOwn(THEMES, themeId)) return THEMES[themeId];
    if (!warnedThemes.has(themeId)) {
      console.warn(`Unknown theme "${themeId}"; using the default theme.`);
      warnedThemes.add(themeId);
    }
    return THEMES.default;
  }
  function applyTheme(themeId) {
    const theme = getTheme(themeId);
    document.documentElement.dataset.theme = theme.id;
    document.title = theme.title;
    document.querySelectorAll('[data-theme-title]').forEach((element) => {
      element.textContent = theme.title;
    });
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme.colors.bg;
    return theme.id;
  }
  let landingThemeId = localStorage.getItem('ff_landing_theme') || 'default';
  landingThemeId = applyTheme(landingThemeId);

  function renderThemePicker() {
    $('#theme-picker').innerHTML = Object.values(THEMES).map((theme) => `
      <button class="theme-card" type="button" data-theme-choice="${theme.id}" aria-pressed="${theme.id === landingThemeId}">
        <span class="theme-swatches" aria-hidden="true">
          <i style="--swatch-color:${theme.colors.bg}"></i>
          <i style="--swatch-color:${theme.colors.text}"></i>
          <i style="--swatch-color:${theme.colors.primary}"></i>
          <i style="--swatch-color:${theme.colors.accent}"></i>
          <i style="--swatch-color:${theme.colors.teamBlue}"></i>
          <i style="--swatch-color:${theme.colors.teamRed}"></i>
        </span>
        <span class="theme-card-name">${theme.name}</span>
      </button>`).join('');
  }
  renderThemePicker();
  $('#theme-picker').addEventListener('click', (event) => {
    const card = event.target.closest('[data-theme-choice]');
    if (!card) return;
    landingThemeId = applyTheme(card.dataset.themeChoice);
    localStorage.setItem('ff_landing_theme', landingThemeId);
    renderThemePicker();
  });
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const setConnection = (element, online) => {
    element.classList.toggle('is-online', online);
    element.innerHTML = `<i></i> ${online ? 'Connected' : 'Reconnecting…'}`;
  };
  const playerKeys = ['feudPlayerCode', 'feudPlayerId', 'feudPlayerName'];
  const hostKeys = ['feudHostCode', 'feudHostToken'];
  const hostSaved = () => ({ code: localStorage.getItem('feudHostCode'), token: localStorage.getItem('feudHostToken') });
  const playerSaved = () => ({
    code: localStorage.getItem('feudPlayerCode'),
    playerId: localStorage.getItem('feudPlayerId'),
    name: localStorage.getItem('feudPlayerName')
  });
  let publicBase = window.location.origin;

  fetch('/config')
    .then((response) => {
      if (!response.ok) throw new Error('Could not load public URL settings.');
      return response.json();
    })
    .then((config) => {
      if (config.publicUrl) publicBase = config.publicUrl;
      if (host.state) host.updateShareLink();
    })
    .catch((error) => console.error(error));

  function roomLink(code) {
    const url = new URL('/', publicBase || window.location.origin);
    url.searchParams.set('room', code);
    return url;
  }

  function hashRoute() {
    const [route, query = ''] = window.location.hash.slice(1).split('?');
    const params = new URLSearchParams(query);
    return { route, room: params.get('room') || new URLSearchParams(window.location.search).get('room') || '' };
  }

  function setRoute(route) {
    const next = route ? `#${route}` : '';
    if (window.location.hash !== next) window.location.hash = next;
    else renderRoute();
  }

  function renderRoute() {
    const savedHost = hostSaved();
    const savedPlayer = playerSaved();
    const params = hashRoute();
    if (params.route === 'presentation') {
      const room = params.room.trim().toUpperCase();
      if (room) window.location.replace(`/presentation?room=${encodeURIComponent(room)}`);
      return;
    }
    if (savedHost.code && savedHost.token) params.route = 'host';
    else if (savedPlayer.code && savedPlayer.playerId && savedPlayer.name) params.route = 'join';
    const route = params.route === 'host' || params.route === 'join' ? params.route : '';
    $('#landing-view').hidden = Boolean(route);
    $('#host-route').hidden = route !== 'host';
    $('#join-route').hidden = route !== 'join';
    if (!route) applyTheme(landingThemeId);
    if (route === 'join' && params.room) $('#room-input').value = params.room.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (!savedHost.code && !savedPlayer.code && route === 'host') $('#create-panel').hidden = false;
  }

  const host = (() => {
    let current = null;
    let editorQuestions = [];
    const connection = $('#connection-status');

    function showMessage(text, target) {
      target = target || (current ? $('#message') : $('#host-error'));
      target.textContent = text;
      target.hidden = !text;
    }

    function request(event, extra = {}) {
      return new Promise((resolve, reject) => {
        const { code, token } = hostSaved();
        socket.emit(event, { code, token, ...extra }, (result) => {
          if (!result?.ok) return reject(new Error(result?.error || 'The action could not be completed.'));
          if (result.state) render(result.state);
          resolve(result);
        });
      });
    }

    async function act(event, extra = {}, successMessage = '') {
      try {
        await request(event, extra);
        showMessage(successMessage);
      } catch (error) {
        showMessage(error.message);
      }
    }

    function updateShareLink() {
      if (!current) return;
      const link = roomLink(current.code);
      $('#join-url').href = link.toString();
      $('#join-url').textContent = link.toString();
      $('#join-qr').src = `/qr.svg?url=${encodeURIComponent(link.toString())}`;
      const presentation = new URL('/presentation', publicBase || window.location.origin);
      presentation.searchParams.set('room', current.code);
      $('#presentation-link').href = presentation.toString();
    }

    function render(state) {
      current = state;
      const themeId = applyTheme(state.themeId);
      $('#create-panel').hidden = true;
      $('#dashboard').hidden = false;
      $('#room-code').textContent = state.code;
      $('#room-theme-name').textContent = THEMES[themeId].name;
      updateShareLink();
      const roundScores = state.roundScores || { blue: 0, red: 0 };
      $('#blue-total').textContent = roundScores.blue;
      $('#red-total').textContent = roundScores.red;
      const roundNumber = state.session?.number ?? Math.max(0, state.sessionNumber || 0);
      $('#session-scoreline').textContent = `Round ${roundNumber} — Blue ${roundScores.blue} / Red ${roundScores.red}`;
      $('#player-count').textContent = `${state.players.length} ${state.players.length === 1 ? 'player' : 'players'}`;
      $('#players-heading-count').textContent = state.players.length;
      $('#session-label').textContent = state.session ? `ROUND ${state.session.number}` : 'NO ROUND';
      $('#host-leave').disabled = Boolean(state.session);
      $('#host-leave').hidden = false;
      $('#host-leave').title = state.session ? 'End the active session before leaving' : '';
      renderPlayers();
      renderSession();
      renderHistory();
      renderSubmissionLog();
      renderRoute();
    }

    function renderPlayers() {
      const list = $('#players-list');
      if (!current.players.length) {
        list.innerHTML = '<div class="empty-players">No players yet. Put the room code on screen.</div>';
        $('#remove-all-played').hidden = true;
        return;
      }
      const session = current.session;
      const playedCount = current.players.filter((player) => player.played).length;
      $('#remove-all-played').hidden = !playedCount || Boolean(session);
      list.innerHTML = current.players.map((player) => {
        const inSession = session?.playerIds.includes(player.id);
        const canSwap = session?.status === 'ready' && inSession;
        const team = player.team ? `<span class="team-mini ${player.team}">${player.team.toUpperCase()}</span>` : '<span>WAITING</span>';
        const played = player.played ? '<span class="played-mark">PLAYED</span>' : '';
        return `<div class="player-row">
          <div><div class="player-row-name">${escape(player.name)}</div><div class="player-row-meta">${team}${played}${player.connected ? '' : '<span class="disconnect-mark">DISCONNECTED</span>'}</div></div>
          <div class="player-row-actions">${canSwap ? `<button data-swap="${escape(player.id)}">Swap team</button>` : ''}${!inSession ? `<button data-remove="${escape(player.id)}" title="Remove player">Remove</button>` : ''}</div>
        </div>`;
      }).join('');
    }

    function renderSession() {
      const session = current.session;
      const ready = session?.status === 'ready';
      const question = session?.question;
      const activeGame = Boolean(question && ['playing', 'steal'].includes(question.status));
      const finalScoreShown = Boolean(session?.finalScoreShown);
      $('#start-session').hidden = Boolean(session);
      $('#start-session').disabled = current.players.filter((player) => player.waiting && player.connected).length < 4;
      $('#start-question').hidden = !ready;
      $('#question-editor-open').disabled = Boolean(session);
      $('#question-editor-open').title = session ? 'End the session before editing questions' : '';
      $('#end-session').hidden = !session;
      $('#ready-view').hidden = Boolean(question);
      $('#board-view').hidden = !question || (session?.status === 'complete' && !finalScoreShown);
      $('#final-score').hidden = session?.status !== 'complete';
      $('#round-complete-note').hidden = !finalScoreShown;
      if (session?.status === 'complete') {
        $('#final-copy').textContent = `Round ${session.number} finished ${session.scores.blue}–${session.scores.red}.`;
      }
      if (!question) return;

      $('#question-number').textContent = `QUESTION ${session.questionIndex + 1} OF ${session.questionCount}`;
      $('#question-text').textContent = question.text;
      $('#board-mode').textContent = question.status === 'steal' ? 'STEAL ATTEMPT' : question.status === 'ended' ? 'QUESTION COMPLETE' : 'REGULAR TURN';
      $('#board-mode').classList.toggle('steal', question.status === 'steal');
      $('#active-team').className = `active-team ${question.activeTeam}`;
      $('#active-team').lastElementChild.textContent = `${question.activeTeam.toUpperCase()} TEAM ${question.status === 'steal' ? '· STEAL' : '· ACTIVE'}`;
      $('#question-points').textContent = question.accumulated;
      $('#answer-board').innerHTML = question.answers.map((answer, index) => {
        const revealed = question.revealed.includes(index) || question.status === 'ended';
        const owner = revealed ? (question.revealedBy?.[index] ?? null) : null;
        const ownerClass = owner === 'blue' ? 'blue' : owner === 'red' ? 'red' : 'unmatched';
        const classes = `answer-tile host-answer-tile${revealed ? ` revealed ${ownerClass}` : ''}`;
        const indicator = revealed ? '✓' : '✗';
        return `<button class="${classes}" type="button" data-reveal-answer="${index}" aria-label="${revealed ? 'Revealed' : 'Unrevealed'} answer ${index + 1}: ${escape(answer.text)}, ${answer.points} points">
          <span class="answer-index">${index + 1}</span>
          <span class="answer-state ${revealed ? 'is-revealed' : 'is-hidden'}" aria-hidden="true">${indicator}</span>
          <span class="answer-copy">${escape(answer.text)}</span>
          <span class="answer-points">${answer.points}</span>
        </button>`;
      }).join('');
      ['blue', 'red'].forEach((team) => {
        const element = $(`#${team}-strikes`);
        element.className = `strike-team ${team}`;
        element.querySelector('i').innerHTML = Array.from({ length: 3 }, (_, index) => `<span class="${index < question.strikes[team] ? 'strike-on' : ''}">${index < question.strikes[team] ? '×' : '○'}</span>`).join(' ');
      });
      $('#submission-box').hidden = !question.submission || !activeGame;
      $('#submission-box').className = `submission-box${question.submission ? ` ${question.submission.team}` : ''}`;
      if (question.submission) {
        $('#submitted-answer').textContent = question.submission.text;
        $('#submitted-by').textContent = `${question.submission.team.toUpperCase()} TEAM · Submitted by ${question.submission.playerName}`;
      }
      $('#add-strike').hidden = !activeGame;
      $('#add-strike').textContent = question.status === 'steal' ? 'Fail Steal' : 'Add Strike';
      $('#pass-control').hidden = !activeGame || question.status === 'steal' || Boolean(question.submission);
      const isLastQuestion = session.questionIndex === session.questionCount - 1;
      $('#next-question').hidden = question.status !== 'ended' || isLastQuestion;
      $('#show-final-score').hidden = finalScoreShown || question.status !== 'ended' || !isLastQuestion;
      $('#round-result').hidden = !question.result;
      $('#round-result').textContent = question.result || '';
    }

    function renderLogGroups(sessions, openLatest = false) {
      if (!sessions.length) return '<p class="empty-log">No submissions yet.</p>';
      return sessions.map((item, sessionIndex) => {
        const groups = item.log || [];
        const questions = groups.map((group, groupIndex) => {
          const entries = group.entries.map((entry) => `
            <div class="submission-log-entry">
              <time>${escape(new Date(entry.timestamp).toLocaleString())}</time>
              <span class="team-mini ${escape(entry.team)}">${escape(entry.team.toUpperCase())}</span>
              <strong>${escape(entry.playerName)}</strong>
              <span class="log-raw">${escape(entry.rawInput || '(no answer)')}</span>
              <span class="log-result">${escape(entry.result)}${entry.points ? ` · +${entry.points} pts` : ''}</span>
              ${entry.note ? `<small>${escape(entry.note)}</small>` : ''}
            </div>`).join('');
          const questionOpen = openLatest && sessionIndex === sessions.length - 1 && groupIndex === groups.length - 1;
          return `<details class="question-log" ${questionOpen ? 'open' : ''}>
            <summary>Show question ${group.questionNumber}: ${escape(group.questionText)}</summary>
            <div class="question-log-entries">${entries || '<p class="empty-log">No submissions yet.</p>'}</div>
          </details>`;
        }).join('');
        const isCurrentSession = item.current;
        const sessionOpen = openLatest && isCurrentSession;
        return `<details class="session-log-group" ${sessionOpen ? 'open' : ''}>
          <summary>Session ${item.number}${isCurrentSession ? ' · in progress' : ''}</summary>
          ${questions || '<p class="empty-log">No submissions yet.</p>'}
        </details>`;
      }).join('');
    }

    function renderSubmissionLog() {
      const historySessions = current.history.map((item) => ({
        number: item.number,
        log: item.submissionLog || [],
        current: false
      }));
      const sessions = current.session
        ? [...historySessions, {
          number: current.session.number,
          log: current.session.submissionLog || [],
          current: true
        }]
        : historySessions;
      $('#submission-log-panel').hidden = !sessions.length;
      $('#submission-log').innerHTML = renderLogGroups(sessions, Boolean(current.session));
      const latest = current.session
        ? (current.session.status === 'complete' ? sessions[sessions.length - 1] : null)
        : sessions[sessions.length - 1];
      $('#summary-submission-log').innerHTML = latest
        ? `<h3><span data-theme-title></span> · Session ${latest.number} submission log</h3><div class="summary-log-scroll">${renderLogGroups([latest], true)}</div>`
        : '';
      if (latest) {
        $('#summary-submission-log [data-theme-title]').textContent = THEMES[getTheme(current.themeId).id].title;
      }
    }

    function renderHistory() {
      const pastRounds = current.roundHistory || [];
      const historyPanel = $('#round-history-panel');
      const historyContent = $('#round-history');
      historyPanel.hidden = !pastRounds.length;
      historyContent.innerHTML = pastRounds.length
        ? pastRounds.map((round) => `<div class="round-history-item">Round ${round.roundNumber} — Blue ${round.blue} / Red ${round.red} (${round.questionCount} question${round.questionCount === 1 ? '' : 's'})</div>`).join('')
        : '';
      if (!current.session && current.history.length) {
        const latest = current.history[current.history.length - 1];
        $('#final-score').hidden = false;
        $('#final-copy').textContent = `Round ${latest.number} finished ${latest.blue}–${latest.red}.`;
      } else if (!current.session) {
        $('#final-score').hidden = true;
      }
    }

    function openEditor() {
      if (!current || current.session) return;
      editorQuestions = clone(current.questions);
      $('#editor-message').hidden = true;
      $('#editor-modal').hidden = false;
      renderEditor();
    }

    function renderEditor() {
      $('#question-editor-list').innerHTML = editorQuestions.length ? editorQuestions.map((item, questionIndex) => `
        <article class="question-card" data-question="${questionIndex}">
          <div class="question-card-head">
            <input class="question-field" data-question-field="question" value="${escape(item.question)}" aria-label="Question ${questionIndex + 1}">
            <button class="button button-quiet" data-move="up" ${questionIndex === 0 ? 'disabled' : ''} title="Move question up">↑</button>
            <button class="button button-quiet" data-move="down" ${questionIndex === editorQuestions.length - 1 ? 'disabled' : ''} title="Move question down">↓</button>
            <button class="button button-quiet" data-delete-question>Delete</button>
          </div>
          <div class="answer-editor-list">${item.answers.map((answer, answerIndex) => `
            <div class="answer-editor-row" data-answer="${answerIndex}">
              <input data-answer-field="text" value="${escape(answer.text)}" aria-label="Answer ${answerIndex + 1}">
              <input class="points-input" data-answer-field="points" type="number" min="1" step="1" value="${escape(answer.points)}" aria-label="Points for answer ${answerIndex + 1}">
              <button type="button" data-move-answer="up" ${answerIndex === 0 ? 'disabled' : ''} aria-label="Move answer ${answerIndex + 1} up">↑</button>
              <button type="button" data-move-answer="down" ${answerIndex === item.answers.length - 1 ? 'disabled' : ''} aria-label="Move answer ${answerIndex + 1} down">↓</button>
              <button type="button" data-delete-answer aria-label="Delete answer ${answerIndex + 1}">×</button>
            </div>`).join('')}
          </div>
          <button class="button button-outline add-answer" data-add-answer>＋ Add answer</button>
        </article>`).join('') : '<p class="empty-editor">No questions yet. Add a question or import JSON.</p>';
    }

    function closeEditor() { $('#editor-modal').hidden = true; }

    // Canonical question JSON schema: [{ "text": "...", "answers": [{ "text": "...", "points": 30 }] }].
    function parseImportedQuestions(text) {
      let parsed;
      try {
        parsed = JSON.parse(text.replace(/^\uFEFF/, '').trim());
      } catch (error) {
        throw new Error(`Invalid JSON: ${error.message}`);
      }
      if (!Array.isArray(parsed)) {
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
            Object.keys(parsed).some((key) => key !== 'questions')) {
          throw new Error('JSON must be a question array or an object containing only a "questions" array.');
        }
        parsed = parsed.questions;
      }
      if (!Array.isArray(parsed) || parsed.length > 100) {
        throw new Error('Provide no more than 100 questions.');
      }
      const imported = parsed.map((item, questionIndex) => {
        const q = questionIndex + 1;
        if (!item || typeof item !== 'object' || Array.isArray(item) ||
            Object.keys(item).some((key) => !['text', 'answers'].includes(key))) {
          throw new Error(`Question ${q}: use only "text" and "answers" fields.`);
        }
        if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 180) {
          throw new Error(`Question ${q}: text must be a non-empty string of at most 180 characters.`);
        }
        if (!Array.isArray(item.answers) || item.answers.length < 2 || item.answers.length > 12) {
          throw new Error(`Question ${q}: provide 2 to 12 answers.`);
        }
        const seen = new Set();
        const answers = item.answers.map((answer, answerIndex) => {
          const a = answerIndex + 1;
          if (!answer || typeof answer !== 'object' || Array.isArray(answer) ||
              Object.keys(answer).some((key) => !['text', 'points'].includes(key))) {
            throw new Error(`Question ${q}, answer ${a}: use only "text" and "points" fields.`);
          }
          if (typeof answer.text !== 'string' || !answer.text.trim() || answer.text.length > 80) {
            throw new Error(`Question ${q}, answer ${a}: text must be a non-empty string of at most 80 characters.`);
          }
          if (!Number.isInteger(answer.points) || answer.points < 1 || answer.points > 10000) {
            const got = typeof answer.points === 'string' ? `'${answer.points}'` : String(answer.points);
            throw new Error(`Question ${q}, answer ${a}: points must be a positive integer (got ${got}).`);
          }
          const normalized = answer.text.toLowerCase().normalize('NFD')
            .replace(/\p{Diacritic}/gu, '').replace(/[\p{P}\p{S}]/gu, '')
            .trim().replace(/\s+/g, ' ');
          if (!normalized) throw new Error(`Question ${q}, answer ${a}: include at least one letter or number.`);
          if (seen.has(normalized)) throw new Error(`Question ${q}: duplicate answer "${answer.text}".`);
          seen.add(normalized);
          return { text: answer.text, points: answer.points };
        });
        return { question: item.text, answers };
      });
      return imported;
    }

    function importQuestionText(text) {
      const imported = parseImportedQuestions(text);
      editorQuestions = imported;
      renderEditor();
      showMessage('Imported into the editor. Save questions to apply the changes.', $('#editor-message'));
    }

    async function sync() {
      $('#host-reconnecting').hidden = false;
      $('#create-room').disabled = true;
      $('#create-room').hidden = true;
      $('#host-back-link').hidden = true;
      try {
        const result = await request('hostSync');
        render(result.state);
        $('#host-reconnecting').hidden = true;
      } catch (error) {
        hostKeys.forEach((key) => localStorage.removeItem(key));
        current = null;
        $('#dashboard').hidden = true;
        $('#create-panel').hidden = false;
        $('#host-reconnecting').hidden = true;
        $('#create-room').hidden = false;
        $('#create-room').disabled = false;
        $('#host-back-link').hidden = false;
        $('#host-leave').hidden = true;
        showMessage(error.message);
        renderRoute();
      }
    }

    async function create() {
      const button = $('#create-room');
      button.disabled = true;
      try {
        const result = await new Promise((resolve, reject) => socket.emit('createRoom', { themeId: landingThemeId }, (reply) => reply?.ok ? resolve(reply) : reject(new Error(reply?.error || 'Could not create room.'))));
        localStorage.setItem('feudHostCode', result.code);
        localStorage.setItem('feudHostToken', result.token);
        setRoute('host');
        render(result.state);
        showMessage('');
      } catch (error) {
        showMessage(error.message);
        button.disabled = false;
      }
    }

    async function leave() {
      if (current?.session) return;
      try {
        await request('hostLeave');
        hostKeys.forEach((key) => localStorage.removeItem(key));
        current = null;
        $('#dashboard').hidden = true;
        $('#create-panel').hidden = false;
        $('#create-room').disabled = false;
        $('#host-leave').hidden = true;
        $('#editor-modal').hidden = true;
        setRoute('');
      } catch (error) {
        showMessage(error.message);
      }
    }

    $('#create-room').addEventListener('click', create);
    $('#start-session').addEventListener('click', () => act('startSession'));
    $('#start-question').addEventListener('click', () => act('startQuestion'));
    $('#end-session').addEventListener('click', () => {
      if (confirm('End the round now? The current round score will be frozen to round history and reset to 0–0.')) act('endSession');
    });
    $('#reset-room').addEventListener('click', () => {
      if (confirm('Reset the room? This clears players and all scores but keeps the question bank and theme.')) act('resetRoom');
    });
    $('#host-leave').addEventListener('click', leave);
    $('#players-list').addEventListener('click', (event) => {
      const swap = event.target.closest('[data-swap]');
      const remove = event.target.closest('[data-remove]');
      if (swap) act('swapTeam', { playerId: swap.dataset.swap });
      if (remove && confirm('Remove this player from the room?')) act('removePlayer', { playerId: remove.dataset.remove });
    });
    $('#remove-all-played').addEventListener('click', () => act('removeAllPlayedPlayers', {}, 'Played players removed.'));
    $('#answer-board').addEventListener('click', (event) => {
      const tile = event.target.closest('[data-reveal-answer]');
      if (!tile) return;
      const index = Number(tile.dataset.revealAnswer);
      const question = current?.session?.question;
      if (question?.revealed.includes(index) || question?.status === 'ended') {
        tile.classList.remove('click-feedback');
        void tile.offsetWidth;
        tile.classList.add('click-feedback');
        window.setTimeout(() => tile.classList.remove('click-feedback'), 450);
        return;
      }
      act('revealAnswer', { index });
    });
    $('#add-strike').addEventListener('click', () => act('addStrike'));
    $('#pass-control').addEventListener('click', () => act('passControl'));
    $('#next-question').addEventListener('click', () => act('nextQuestion'));
    $('#show-final-score').addEventListener('click', () => act('showFinalScore'));
    $('#copy-link').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('#join-url').href);
        showMessage('Join link copied.');
      } catch (error) {
        showMessage(`Could not copy the link: ${error.message}`);
      }
    });
    $('#question-editor-open').addEventListener('click', openEditor);
    $('#editor-close').addEventListener('click', closeEditor);
    $('[data-close-editor]').addEventListener('click', closeEditor);
    $('#add-question').addEventListener('click', () => {
      editorQuestions.push({ question: '', answers: [{ text: '', points: 10 }, { text: '', points: 5 }] });
      renderEditor();
      $('#question-editor-list').lastElementChild?.querySelector('.question-field')?.focus();
    });
    $('#question-editor-list').addEventListener('input', (event) => {
      const card = event.target.closest('[data-question]');
      if (!card) return;
      const questionIndex = Number(card.dataset.question);
      const questionField = event.target.dataset.questionField;
      if (questionField) editorQuestions[questionIndex][questionField] = event.target.value;
      const answerRow = event.target.closest('[data-answer]');
      const answerField = event.target.dataset.answerField;
      if (answerRow && answerField) editorQuestions[questionIndex].answers[Number(answerRow.dataset.answer)][answerField] = event.target.value;
    });
    $('#question-editor-list').addEventListener('click', (event) => {
      const card = event.target.closest('[data-question]');
      if (!card) return;
      const index = Number(card.dataset.question);
      if (event.target.closest('[data-delete-question]')) {
        editorQuestions.splice(index, 1);
      } else if (event.target.closest('[data-move="up"]') && index > 0) {
        [editorQuestions[index - 1], editorQuestions[index]] = [editorQuestions[index], editorQuestions[index - 1]];
      } else if (event.target.closest('[data-move="down"]') && index < editorQuestions.length - 1) {
        [editorQuestions[index + 1], editorQuestions[index]] = [editorQuestions[index], editorQuestions[index + 1]];
      } else if (event.target.closest('[data-add-answer]')) {
        editorQuestions[index].answers.push({ text: '', points: 1 });
      } else if (event.target.closest('[data-move-answer]')) {
        const answerIndex = Number(event.target.closest('[data-answer]').dataset.answer);
        const direction = event.target.closest('[data-move-answer]').dataset.moveAnswer;
        const targetIndex = direction === 'up' ? answerIndex - 1 : answerIndex + 1;
        if (targetIndex >= 0 && targetIndex < editorQuestions[index].answers.length) {
          [editorQuestions[index].answers[answerIndex], editorQuestions[index].answers[targetIndex]] =
            [editorQuestions[index].answers[targetIndex], editorQuestions[index].answers[answerIndex]];
        }
      } else if (event.target.closest('[data-delete-answer]')) {
        const answerIndex = Number(event.target.closest('[data-answer]').dataset.answer);
        if (editorQuestions[index].answers.length <= 2) return showMessage('Each question needs at least two answers.', $('#editor-message'));
        editorQuestions[index].answers.splice(answerIndex, 1);
      } else return;
      $('#editor-message').hidden = true;
      renderEditor();
    });
    $('#save-questions').addEventListener('click', async () => {
      try {
        const result = await request('updateQuestions', { questions: editorQuestions });
        render(result.state);
        showMessage('Question bank saved.', $('#editor-message'));
      } catch (error) { showMessage(error.message, $('#editor-message')); }
    });
    function canonicalQuestionExport(questions = editorQuestions) {
      return questions.map((item) => ({
        text: item.question,
        answers: item.answers.map((answer) => ({ text: answer.text, points: answer.points }))
      }));
    }
    function setExportMessage(text, error = false) {
      const target = $('#export-error');
      target.textContent = text;
      target.hidden = !text;
      target.classList.toggle('is-error', error);
    }
    function openExportModal() {
      try {
        const questions = editorQuestions.length ? editorQuestions : current.questions;
        const payload = canonicalQuestionExport(questions);
        const textarea = $('#export-json');
        textarea.value = JSON.stringify(payload, null, 2);
        textarea.focus();
        textarea.select();
        setExportMessage('');
        $('#export-modal').hidden = false;
      } catch (error) {
        setExportMessage(error.message || 'Could not prepare the export.', true);
        $('#export-modal').hidden = false;
      }
    }
    $('#export-questions').addEventListener('click', () => {
      try {
        openExportModal();
      } catch (error) {
        showMessage(error.message, $('#editor-message'));
      }
    });
    $('#close-export').addEventListener('click', () => $('#export-modal').hidden = true);
    $('#close-export-inline').addEventListener('click', () => $('#export-modal').hidden = true);
    $('[data-close-export]').addEventListener('click', () => $('#export-modal').hidden = true);
    $('#copy-export').addEventListener('click', async () => {
      const text = $('#export-json').value;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          $('#export-json').focus();
          $('#export-json').select();
          const success = document.execCommand('copy');
          if (!success) throw new Error('copy failed');
        }
        setExportMessage('Copied!');
        window.setTimeout(() => setExportMessage(''), 2000);
      } catch (error) {
        $('#export-json').focus();
        $('#export-json').select();
        setExportMessage('Press Ctrl/Cmd+C to copy.', true);
      }
    });
    $('#download-export').addEventListener('click', () => {
      let downloadUrl = '';
      const link = document.createElement('a');
      try {
        const jsonString = $('#export-json').value;
        const blob = new Blob([jsonString], { type: 'application/json' });
        downloadUrl = URL.createObjectURL(blob);
        link.href = downloadUrl;
        link.download = 'questions.json';
        document.body.appendChild(link);
        link.click();
        setExportMessage('');
      } catch (error) {
        setExportMessage(error.message || 'Download failed.', true);
      } finally {
        link.remove();
        if (downloadUrl) {
          try {
            URL.revokeObjectURL(downloadUrl);
          } catch (error) {
            setExportMessage(`Download cleanup failed: ${error.message}`, true);
          }
        }
      }
    });
    $('#import-questions').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          importQuestionText(typeof reader.result === 'string' ? reader.result : '');
        } catch (error) {
          showMessage(`Could not import JSON: ${error.message}`, $('#editor-message'));
        } finally {
          event.target.value = '';
        }
      };
      reader.onerror = () => {
        showMessage(`Could not read JSON file: ${reader.error?.message || 'FileReader failed.'}`, $('#editor-message'));
        event.target.value = '';
      };
      try {
        reader.readAsText(file);
      } catch (error) {
        showMessage(`Could not read JSON file: ${error.message}`, $('#editor-message'));
        event.target.value = '';
      }
    });
    $('#import-pasted').addEventListener('click', async () => {
      try {
        await importQuestionText($('#import-text').value);
      } catch (error) { showMessage(`Could not import JSON: ${error.message}`, $('#editor-message')); }
    });
    socket.on('hostState', render);

    return {
      get state() { return current; },
      sync,
      setOnline: (online) => setConnection(connection, online),
      updateShareLink
    };
  })();

  const player = (() => {
    let current = null;
    let previousQuestionKey = '';
    let previousTotalStrikes = null;
    let joining = false;
    const connection = $('#player-connection');

    function updateStrikeFlash(question) {
      const team = current?.player.team;
      const questionKey = question ? `${current.session.number}:${current.session.questionIndex}` : '';
      const strikes = team && questionKey
        ? (Number(question.strikes?.blue) || 0) + (Number(question.strikes?.red) || 0)
        : null;
      if (questionKey !== previousQuestionKey) {
        previousQuestionKey = questionKey;
        previousTotalStrikes = strikes;
        return;
      }
      if (strikes !== null && previousTotalStrikes !== null && strikes > previousTotalStrikes) {
        const flash = $('#strike-flash');
        flash.classList.remove('strike-flash-active');
        void flash.offsetWidth;
        flash.classList.add('strike-flash-active');
      }
      previousTotalStrikes = strikes;
    }

    function showError(text) {
      const target = $('#player-view').hidden ? $('#join-error') : $('#player-notice');
      target.textContent = text;
      target.hidden = !text;
    }

    function join(code, name, playerId = '') {
      if (joining) return;
      joining = true;
      socket.emit('joinRoom', { code, name, playerId }, (result) => {
        joining = false;
        if (!result?.ok) {
          $('#player-reconnecting').hidden = true;
          showError(result?.error || 'Could not join this room.');
          if (playerId) {
            playerKeys.forEach((key) => localStorage.removeItem(key));
            current = null;
            $('#player-view').hidden = true;
            $('#join-panel').hidden = false;
          }
          return;
        }
        localStorage.setItem('feudPlayerCode', result.code);
        localStorage.setItem('feudPlayerId', result.playerId);
        localStorage.setItem('feudPlayerName', name);
        $('#player-reconnecting').hidden = true;
        $('#join-panel').hidden = true;
        $('#player-view').hidden = false;
        showError(result.duplicateName ? 'Another player is using that name. You can still join; your team assignments stay separate.' : '');
        render(result.state);
        renderRoute();
      });
    }

    function render(nextState) {
      current = nextState;
      applyTheme(current.themeId);
      $('#join-panel').hidden = true;
      $('#player-view').hidden = false;
      $('#player-room-code').textContent = `ROOM ${current.code}`;
      $('#waiting-name').textContent = `Hi, ${current.player.name}.`;
      const roundScores = current.roundScores || { blue: 0, red: 0 };
      $('#waiting-blue').textContent = roundScores.blue;
      $('#waiting-red').textContent = roundScores.red;
      $('#game-blue').textContent = roundScores.blue;
      $('#game-red').textContent = roundScores.red;

      const question = current.session?.question;
      updateStrikeFlash(question);
      const assigned = Boolean(current.player.team);
      const inSession = assigned && current.session?.teams?.[current.player.team]?.includes(current.player.id);
      const shouldWait = !current.session || !inSession || !question;
      $('#player-waiting').hidden = !shouldWait;
      $('#player-game').hidden = shouldWait;
      const waitingMessage = !current.session
        ? 'Waiting for the host to start'
        : current.session.status === 'complete'
          ? 'Session complete. Waiting for the host to finish.'
          : inSession && current.session.status === 'ready'
            ? 'Teams are set. The host will start the first question.'
            : 'Session in progress. Waiting for the next group.';
      $('.waiting-message').textContent = waitingMessage;
      const waitingTeam = $('#waiting-team');
      waitingTeam.hidden = !assigned;
      waitingTeam.className = `waiting-team ${current.player.team || ''}`;
      waitingTeam.textContent = assigned ? `${current.player.team.toUpperCase()} TEAM` : '';
      if (shouldWait) return;

      $('#team-badge').className = `team-badge ${current.player.team}`;
      $('#team-badge').textContent = `${current.player.team.toUpperCase()} TEAM`;
      $('#player-session-label').textContent = `Round ${current.session.number} — Blue ${roundScores.blue} / Red ${roundScores.red}`;
      $('#player-question').textContent = question.text;
      const isActive = question.activeTeam === current.player.team && ['playing', 'steal'].includes(question.status);
      const hasSubmission = question.submissionReceived;
      const status = $('#player-turn-status');
      status.className = 'player-turn-status';
      if (question.status === 'ended') {
        status.textContent = 'Question complete. All answers are now revealed.';
        status.classList.add('inactive');
      } else if (question.status === 'steal' && isActive) {
        status.textContent = hasSubmission ? 'Steal answer submitted. The host is resolving it.' : 'Your team has the steal: discuss and submit one answer.';
        status.classList.add('steal');
      } else if (isActive) {
        status.textContent = hasSubmission ? 'Answer submitted. Your team is locked in.' : 'Your team is active — discuss and submit one answer.';
      } else {
        if (hasSubmission || question.isTyping) {
          status.textContent = `${question.activeTeam.toUpperCase()} is typing`;
          const ellipsis = document.createElement('span');
          ellipsis.className = 'typing-ellipsis';
          ellipsis.setAttribute('aria-hidden', 'true');
          ellipsis.innerHTML = '<i>.</i><i>.</i><i>.</i>';
          status.append(ellipsis);
        } else {
          status.textContent = question.status === 'steal' ? 'The other team is making its steal attempt.' : `${question.activeTeam.toUpperCase()} team is answering. Discuss together.`;
        }
        status.classList.add('inactive');
      }
      $('#player-answer-board').innerHTML = question.board.map((answer, index) => {
        const owner = answer.revealedBy || null;
        const ownerClass = owner === 'blue' ? 'blue' : owner === 'red' ? 'red' : 'unmatched';
        const classes = answer.revealed ? `answer-tile revealed ${ownerClass}` : 'answer-tile';
        return `<div class="${classes}"><span class="answer-index">${index + 1}</span>${answer.revealed ? `<span class="answer-copy">${escape(answer.text)}</span><span class="answer-points">${answer.points}</span>` : '<span class="answer-hidden"></span><span class="answer-points">• • •</span>'}</div>`;
      }).join('');
      const canSubmit = isActive && !hasSubmission;
      $('#answer-form').hidden = !canSubmit;
      $('#answer-locked').hidden = !(isActive && hasSubmission && question.status !== 'ended');
      const result = $('#player-result');
      result.hidden = !question.result;
      if (question.result) {
        const strikes = question.strikes[current.player.team] || 0;
        result.textContent = `${question.result} ${strikes} strike${strikes === 1 ? '' : 's'} for your team. Question points: ${question.accumulated}.`;
      }
    }

    function reconnect() {
      const identity = playerSaved();
      $('#player-reconnecting').hidden = false;
      $('#join-panel').hidden = false;
      $('#player-view').hidden = true;
      $('#join-form').hidden = true;
      $('#join-note').hidden = true;
      $('.join-back-link').hidden = true;
      $('#room-input').value = identity.code || '';
      $('#name-input').value = identity.name || '';
      join(identity.code, identity.name, identity.playerId);
    }

    $('#join-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const code = $('#room-input').value.trim().toUpperCase();
      const name = $('#name-input').value.trim().slice(0, 20);
      showError('');
      join(code, name);
    });
    $('#room-input').addEventListener('input', (event) => {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    });
    $('#answer-input').addEventListener('input', (event) => {
      socket.emit('answerTyping', { typing: Boolean(event.target.value) }, (result) => {
        if (!result?.ok) showError(result?.error || 'Typing status could not be updated.');
      });
    });
    $('#answer-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const answer = $('#answer-input').value;
      if (!answer) return;
      const button = $('#answer-form button');
      button.disabled = true;
      socket.emit('submitAnswer', { answer }, (result) => {
        button.disabled = false;
        if (!result?.ok) {
          showError(result?.error || 'Answer could not be submitted.');
        } else {
          $('#answer-input').value = '';
          showError('');
        }
      });
    });
    $('#leave-room').addEventListener('click', () => {
      if (current) socket.emit('leaveRoom', {}, () => {});
      playerKeys.forEach((key) => localStorage.removeItem(key));
      const code = current?.code || $('#room-input').value;
      current = null;
      $('#player-view').hidden = true;
      $('#join-panel').hidden = false;
      $('#join-form').hidden = false;
      $('#join-note').hidden = false;
      $('.join-back-link').hidden = false;
      $('#join-error').hidden = true;
      $('#room-input').value = code || '';
      setRoute('join');
    });
    socket.on('playerState', render);
    socket.on('playerRemoved', (message) => {
      playerKeys.forEach((key) => localStorage.removeItem(key));
      current = null;
      $('#player-view').hidden = true;
      $('#join-panel').hidden = false;
      $('#player-reconnecting').hidden = true;
      $('#join-form').hidden = false;
      $('#join-note').hidden = false;
      $('.join-back-link').hidden = false;
      showError(message);
      renderRoute();
    });

    return {
      reconnect,
      setOnline: (online) => setConnection(connection, online)
    };
  })();

  socket.on('connect', () => {
    host.setOnline(true);
    player.setOnline(true);
    const credentials = hostSaved();
    const identity = playerSaved();
    if (credentials.code && credentials.token) {
      renderRoute();
      host.sync();
    } else if (identity.code && identity.playerId && identity.name) {
      renderRoute();
      player.reconnect();
    }
  });
  socket.on('disconnect', () => {
    host.setOnline(false);
    player.setOnline(false);
  });
  socket.on('connect_error', () => {
    host.setOnline(false);
    player.setOnline(false);
  });

  window.addEventListener('hashchange', renderRoute);
  const initialHost = hostSaved();
  const initialPlayer = playerSaved();
  if (hashRoute().route === 'presentation') {
    renderRoute();
  } else if (initialHost.code && initialHost.token) {
    $('#host-reconnecting').hidden = false;
    $('#create-room').disabled = true;
    $('#create-room').hidden = true;
    $('#host-back-link').hidden = true;
    $('#host-leave').hidden = true;
    window.location.hash = 'host';
  } else if (initialPlayer.code && initialPlayer.playerId && initialPlayer.name) {
    $('#player-reconnecting').hidden = false;
    $('#join-form').hidden = true;
    $('#join-note').hidden = true;
    $('.join-back-link').hidden = true;
    window.location.hash = 'join';
  }
  else {
    const deepLinkRoom = hashRoute().room;
    if (deepLinkRoom) window.location.hash = 'join?room=' + encodeURIComponent(deepLinkRoom);
  }
  renderRoute();
})();
