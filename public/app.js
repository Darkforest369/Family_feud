(() => {
  const socket = io();
  const $ = (selector) => document.querySelector(selector);
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const countdown = (deadline, element) => {
    element.textContent = deadline ? String(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))) : '0';
  };
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
    if (savedHost.code && savedHost.token) params.route = 'host';
    else if (savedPlayer.code && savedPlayer.playerId && savedPlayer.name) params.route = 'join';
    const route = params.route === 'host' || params.route === 'join' ? params.route : '';
    $('#landing-view').hidden = Boolean(route);
    $('#host-route').hidden = route !== 'host';
    $('#join-route').hidden = route !== 'join';
    if (route === 'join' && params.room) $('#room-input').value = params.room.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (!savedHost.code && !savedPlayer.code && route === 'host') $('#create-panel').hidden = false;
  }

  const host = (() => {
    let current = null;
    let editorQuestions = [];
    let timerInterval = null;
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
    }

    function render(state) {
      current = state;
      $('#create-panel').hidden = true;
      $('#dashboard').hidden = false;
      $('#room-code').textContent = state.code;
      updateShareLink();
      $('#blue-total').textContent = state.totals.blue;
      $('#red-total').textContent = state.totals.red;
      $('#player-count').textContent = `${state.players.length} ${state.players.length === 1 ? 'player' : 'players'}`;
      $('#players-heading-count').textContent = state.players.length;
      $('#session-label').textContent = state.session ? `SESSION ${state.session.number} · ${state.session.status.replaceAll('-', ' ').toUpperCase()}` : 'NO SESSION';
      $('#host-leave').disabled = Boolean(state.session);
      $('#host-leave').hidden = false;
      $('#host-leave').title = state.session ? 'End the active session before leaving' : '';
      renderPlayers();
      renderSession();
      renderHistory();
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
      $('#start-session').hidden = Boolean(session);
      $('#start-session').disabled = current.players.filter((player) => player.waiting && player.connected).length < 4;
      $('#start-question').hidden = !ready;
      $('#question-editor-open').disabled = Boolean(session);
      $('#question-editor-open').title = session ? 'End the session before editing questions' : '';
      $('#end-session').hidden = !session;
      $('#ready-view').hidden = Boolean(question);
      $('#board-view').hidden = !question;
      $('#final-score').hidden = session?.status !== 'complete';
      if (session?.status === 'complete') {
        $('#final-copy').textContent = `Session ${session.number} finished ${session.scores.blue}–${session.scores.red}. Bank the session points to update the cumulative board.`;
      }
      if (!question) {
        if (timerInterval) clearInterval(timerInterval);
        return;
      }

      $('#question-number').textContent = `QUESTION ${session.questionIndex + 1} OF ${session.questionCount}`;
      $('#question-text').textContent = question.text;
      $('#board-mode').textContent = question.status === 'steal' ? 'STEAL ATTEMPT' : question.status === 'ended' ? 'QUESTION COMPLETE' : 'REGULAR TURN';
      $('#board-mode').classList.toggle('steal', question.status === 'steal');
      $('#active-team').className = `active-team ${question.activeTeam}`;
      $('#active-team').lastElementChild.textContent = `${question.activeTeam.toUpperCase()} TEAM ${question.status === 'steal' ? '· STEAL' : '· ACTIVE'}`;
      $('#question-points').textContent = question.accumulated;
      $('#answer-board').innerHTML = question.answers.map((answer, index) => {
        const revealed = question.revealed.includes(index) || question.status === 'ended';
        return `<div class="answer-tile ${revealed ? 'revealed' : ''}"><span class="answer-index">${String(index + 1).padStart(2, '0')}</span>${revealed ? `<span class="answer-copy">${escape(answer.text)}</span><span class="answer-points">${answer.points}</span>` : '<span class="answer-hidden"></span><span class="answer-points">• • •</span>'}</div>`;
      }).join('');
      ['blue', 'red'].forEach((team) => {
        const element = $(`#${team}-strikes`);
        element.className = `strike-team ${team}`;
        element.querySelector('i').innerHTML = Array.from({ length: 3 }, (_, index) => `<span class="${index < question.strikes[team] ? 'strike-on' : ''}">${index < question.strikes[team] ? '×' : '○'}</span>`).join(' ');
      });
      $('#submission-box').hidden = !question.submission || !activeGame;
      if (question.submission) {
        $('#submitted-answer').textContent = question.submission.text;
        $('#submitted-by').textContent = `Submitted by ${question.submission.playerName}`;
      }
      $('#host-override').hidden = !activeGame;
      $('#resolve-answer').disabled = !activeGame || (!question.submission && !$('#override-answer').value.trim());
      $('#add-strike').hidden = !activeGame || question.status === 'steal';
      $('#pass-control').hidden = !activeGame || question.status === 'steal';
      $('#skip-timer').hidden = !activeGame;
      $('#next-question').hidden = question.status !== 'ended';
      $('#round-result').hidden = !question.result;
      $('#round-result').textContent = question.result || '';
      countdown(question.deadline, $('#timer'));
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        if (current?.session?.question?.deadline) countdown(current.session.question.deadline, $('#timer'));
      }, 250);
    }

    function renderHistory() {
      if (!current.session && current.history.length) {
        const latest = current.history[current.history.length - 1];
        $('#final-score').hidden = false;
        $('#final-copy').textContent = `Session ${latest.number}: ${latest.blue}–${latest.red}. Cumulative score: Blue ${current.totals.blue}, Red ${current.totals.red}.`;
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
      $('#question-editor-list').innerHTML = editorQuestions.map((item, questionIndex) => `
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
        </article>`).join('');
    }

    function closeEditor() { $('#editor-modal').hidden = true; }

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
        const result = await new Promise((resolve, reject) => socket.emit('createRoom', {}, (reply) => reply?.ok ? resolve(reply) : reject(new Error(reply?.error || 'Could not create room.'))));
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
      if (confirm('End this session and add completed-question points to the cumulative score? An unfinished question will not count.')) act('endSession');
    });
    $('#reset-room').addEventListener('click', () => {
      if (confirm('Reset the room? This clears players and all scores but keeps the question bank.')) act('resetRoom');
    });
    $('#host-leave').addEventListener('click', leave);
    $('#players-list').addEventListener('click', (event) => {
      const swap = event.target.closest('[data-swap]');
      const remove = event.target.closest('[data-remove]');
      if (swap) act('swapTeam', { playerId: swap.dataset.swap });
      if (remove && confirm('Remove this player from the room?')) act('removePlayer', { playerId: remove.dataset.remove });
    });
    $('#remove-all-played').addEventListener('click', () => act('removeAllPlayedPlayers', {}, 'Played players removed.'));
    $('#resolve-answer').addEventListener('click', async () => {
      try {
        await request('resolveAnswer', { answer: $('#override-answer').value.trim() });
        $('#override-answer').value = '';
        showMessage('');
      } catch (error) { showMessage(error.message); }
    });
    $('#override-answer').addEventListener('input', () => {
      const question = current?.session?.question;
      $('#resolve-answer').disabled = !question || !['playing', 'steal'].includes(question.status) || (!question.submission && !$('#override-answer').value.trim());
    });
    $('#clear-submission').addEventListener('click', () => act('clearSubmission'));
    $('#add-strike').addEventListener('click', () => act('addStrike'));
    $('#pass-control').addEventListener('click', () => act('passControl'));
    $('#skip-timer').addEventListener('click', () => act('skipTimer'));
    $('#next-question').addEventListener('click', () => act('nextQuestion'));
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
        if (editorQuestions.length === 1) return showMessage('Keep at least one question.', $('#editor-message'));
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
    $('#export-questions').addEventListener('click', () => {
      const file = new Blob([JSON.stringify(current.questions, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = `christmas-feud-${current.code}-questions.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
    $('#import-questions').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        editorQuestions = Array.isArray(parsed) ? parsed : parsed.questions;
        if (!Array.isArray(editorQuestions)) throw new Error('JSON must contain a question array.');
        if (editorQuestions.some((item) => !item || typeof item.question !== 'string' || !Array.isArray(item.answers))) {
          throw new Error('Each question needs text and an answers array.');
        }
        renderEditor();
        showMessage('Imported into the editor. Save questions to apply the changes.', $('#editor-message'));
      } catch (error) { showMessage(`Could not import JSON: ${error.message}`, $('#editor-message')); }
      event.target.value = '';
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
    let timerInterval = null;
    let joining = false;
    const connection = $('#player-connection');

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
      $('#join-panel').hidden = true;
      $('#player-view').hidden = false;
      $('#player-room-code').textContent = `ROOM ${current.code}`;
      $('#waiting-name').textContent = `Hi, ${current.player.name}.`;
      $('#waiting-blue').textContent = current.totals.blue;
      $('#waiting-red').textContent = current.totals.red;
      $('#game-blue').textContent = current.totals.blue;
      $('#game-red').textContent = current.totals.red;

      const question = current.session?.question;
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
      if (shouldWait) {
        if (timerInterval) clearInterval(timerInterval);
        return;
      }

      $('#team-badge').className = `team-badge ${current.player.team}`;
      $('#team-badge').textContent = `${current.player.team.toUpperCase()} TEAM`;
      $('#player-session-label').textContent = `SESSION ${current.session.number} · QUESTION ${current.session.questionIndex + 1} OF ${current.session.questionCount}`;
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
        status.textContent = question.status === 'steal' ? 'The other team is making its steal attempt.' : `${question.activeTeam.toUpperCase()} team is answering. Discuss together.`;
        status.classList.add('inactive');
      }
      $('#player-answer-board').innerHTML = question.board.map((answer, index) => `<div class="answer-tile ${answer.revealed ? 'revealed' : ''}"><span class="answer-index">${String(index + 1).padStart(2, '0')}</span>${answer.revealed ? `<span class="answer-copy">${escape(answer.text)}</span><span class="answer-points">${answer.points}</span>` : '<span class="answer-hidden"></span><span class="answer-points">• • •</span>'}</div>`).join('');
      const canSubmit = isActive && !hasSubmission;
      $('#answer-form').hidden = !canSubmit;
      $('#answer-locked').hidden = !(isActive && hasSubmission && question.status !== 'ended');
      const result = $('#player-result');
      result.hidden = !question.result;
      if (question.result) {
        const strikes = question.strikes[current.player.team] || 0;
        result.textContent = `${question.result} ${strikes} strike${strikes === 1 ? '' : 's'} for your team. Question points: ${question.accumulated}.`;
      }
      countdown(question.deadline, $('#player-timer'));
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(() => countdown(question.deadline, $('#player-timer')), 250);
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
    $('#answer-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const answer = $('#answer-input').value.trim();
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
  if (initialHost.code && initialHost.token) {
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
