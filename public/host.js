(() => {
  const socket = io();
  const $ = (selector) => document.querySelector(selector);
  const connection = $('#connection-status');
  let state = null;
  let editorQuestions = [];
  let timerInterval = null;
  const saved = () => ({ code: sessionStorage.getItem('feudHostCode'), token: sessionStorage.getItem('feudHostToken') });

  function showMessage(text, target = $('#message')) {
    target.textContent = text;
    target.hidden = !text;
  }

  function request(event, extra = {}) {
    return new Promise((resolve, reject) => {
      const { code, token } = saved();
      socket.emit(event, { code, token, ...extra }, (result) => {
        if (!result?.ok) return reject(new Error(result?.error || 'The action could not be completed.'));
        if (result.state) render(result.state);
        resolve(result);
      });
    });
  }

  async function act(event, extra, successMessage = '') {
    try {
      await request(event, extra);
      showMessage(successMessage);
    } catch (error) {
      showMessage(error.message);
    }
  }

  function render(stateUpdate) {
    state = stateUpdate;
    $('#create-panel').hidden = true;
    $('#dashboard').hidden = false;
    $('#room-code').textContent = state.code;
    $('#blue-total').textContent = state.totals.blue;
    $('#red-total').textContent = state.totals.red;
    $('#player-count').textContent = `${state.players.length} ${state.players.length === 1 ? 'player' : 'players'}`;
    $('#players-heading-count').textContent = state.players.length;
    $('#session-label').textContent = state.session ? `SESSION ${state.session.number} · ${state.session.status.replaceAll('-', ' ').toUpperCase()}` : 'NO SESSION';
    renderPlayers();
    renderSession();
    renderHistory();
  }

  function renderPlayers() {
    const list = $('#players-list');
    if (!state.players.length) {
      list.innerHTML = '<div class="empty-players">No players yet. Put the room code on screen.</div>';
      return;
    }
    const session = state.session;
    list.innerHTML = state.players.map((player) => {
      const inSession = session?.playerIds.includes(player.id);
      const canSwap = session?.status === 'ready' && inSession;
      const team = player.team ? `<span class="team-mini ${player.team}">${player.team.toUpperCase()}</span>` : '<span>WAITING</span>';
      return `<div class="player-row">
        <div><div class="player-row-name">${Feud.escape(player.name)}</div><div class="player-row-meta">${team}${player.connected ? '' : '<span class="disconnect-mark">DISCONNECTED</span>'}</div></div>
        <div class="player-row-actions">${canSwap ? `<button data-swap="${Feud.escape(player.id)}">Swap team</button>` : ''}${!inSession ? `<button data-remove="${Feud.escape(player.id)}" title="Remove player">Remove</button>` : ''}</div>
      </div>`;
    }).join('');
  }

  function renderSession() {
    const session = state.session;
    const ready = session?.status === 'ready';
    const question = session?.question;
    const activeGame = Boolean(question && ['playing', 'steal'].includes(question.status));
    $('#start-session').hidden = Boolean(session);
    $('#start-session').disabled = state.players.filter((player) => player.waiting && player.connected).length < 4;
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
    if (!question) return;

    $('#question-number').textContent = `QUESTION ${session.questionIndex + 1} OF ${session.questionCount}`;
    $('#question-text').textContent = question.text;
    $('#board-mode').textContent = question.status === 'steal' ? 'STEAL ATTEMPT' : question.status === 'ended' ? 'QUESTION COMPLETE' : 'REGULAR TURN';
    $('#board-mode').classList.toggle('steal', question.status === 'steal');
    $('#active-team').className = `active-team ${question.activeTeam}`;
    $('#active-team').lastElementChild.textContent = `${question.activeTeam.toUpperCase()} TEAM ${question.status === 'steal' ? '· STEAL' : '· ACTIVE'}`;
    $('#question-points').textContent = question.accumulated;
    const board = $('#answer-board');
    board.innerHTML = question.answers.map((answer, index) => {
      const revealed = question.revealed.includes(index) || question.status === 'ended';
      return `<div class="answer-tile ${revealed ? 'revealed' : ''}"><span class="answer-index">${String(index + 1).padStart(2, '0')}</span>${revealed ? `<span class="answer-copy">${Feud.escape(answer.text)}</span><span class="answer-points">${answer.points}</span>` : '<span class="answer-hidden"></span><span class="answer-points">• • •</span>'}</div>`;
    }).join('');
    ['blue', 'red'].forEach((team) => {
      const element = $(`#${team}-strikes`);
      element.className = `strike-team ${team}`;
      element.querySelector('i').innerHTML = Array.from({ length: 3 }, (_, index) => `<span class="${index < question.strikes[team] ? 'strike-on' : ''}">${index < question.strikes[team] ? '×' : '○'}</span>`).join(' ');
    });
    const submissionBox = $('#submission-box');
    submissionBox.hidden = !question.submission || !activeGame;
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
    $('#timer').textContent = question.deadline ? Math.max(0, Math.ceil((question.deadline - Date.now()) / 1000)) : '0';
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (!state?.session?.question?.deadline) return;
      $('#timer').textContent = Math.max(0, Math.ceil((state.session.question.deadline - Date.now()) / 1000));
    }, 250);
  }

  function renderHistory() {
    const history = state.history;
    if (!state.session && history.length) {
      const latest = history[history.length - 1];
      $('#final-score').hidden = false;
      $('#final-copy').textContent = `Session ${latest.number}: ${latest.blue}–${latest.red}. Cumulative score: Blue ${state.totals.blue}, Red ${state.totals.red}.`;
    } else if (!state.session) {
      $('#final-score').hidden = true;
    }
  }

  function openEditor() {
    if (!state || state.session) return;
    editorQuestions = Feud.clone(state.questions);
    $('#editor-message').hidden = true;
    $('#editor-modal').hidden = false;
    renderEditor();
  }

  function renderEditor() {
    $('#question-editor-list').innerHTML = editorQuestions.map((item, questionIndex) => `
      <article class="question-card" data-question="${questionIndex}">
        <div class="question-card-head">
          <input class="question-field" data-question-field="question" value="${Feud.escape(item.question)}" aria-label="Question ${questionIndex + 1}">
          <button class="button button-quiet" data-move="up" ${questionIndex === 0 ? 'disabled' : ''} title="Move question up">↑</button>
          <button class="button button-quiet" data-move="down" ${questionIndex === editorQuestions.length - 1 ? 'disabled' : ''} title="Move question down">↓</button>
          <button class="button button-quiet" data-delete-question>Delete</button>
        </div>
        <div class="answer-editor-list">${item.answers.map((answer, answerIndex) => `
          <div class="answer-editor-row" data-answer="${answerIndex}">
            <input data-answer-field="text" value="${Feud.escape(answer.text)}" aria-label="Answer ${answerIndex + 1}">
            <input class="points-input" data-answer-field="points" type="number" min="1" step="1" value="${Feud.escape(answer.points)}" aria-label="Points for answer ${answerIndex + 1}">
            <button type="button" data-delete-answer aria-label="Delete answer ${answerIndex + 1}">×</button>
          </div>`).join('')}
        </div>
        <button class="button button-outline add-answer" data-add-answer>＋ Add answer</button>
      </article>`).join('');
  }

  function closeEditor() { $('#editor-modal').hidden = true; }

  socket.on('connect', async () => {
    Feud.setConnection(connection, true);
    const credentials = saved();
    if (credentials.code && credentials.token) {
      try {
        const result = await request('hostSync');
        render(result.state);
      } catch (error) {
        sessionStorage.removeItem('feudHostCode');
        sessionStorage.removeItem('feudHostToken');
        showMessage(error.message);
      }
    }
  });
  socket.on('disconnect', () => Feud.setConnection(connection, false));
  socket.on('hostState', render);
  socket.on('connect_error', () => Feud.setConnection(connection, false));

  $('#create-room').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await new Promise((resolve, reject) => socket.emit('createRoom', {}, (reply) => reply?.ok ? resolve(reply) : reject(new Error(reply?.error || 'Could not create room.'))));
      sessionStorage.setItem('feudHostCode', result.code);
      sessionStorage.setItem('feudHostToken', result.token);
      render(result.state);
    } catch (error) {
      showMessage(error.message);
      button.disabled = false;
    }
  });
  $('#start-session').addEventListener('click', () => act('startSession'));
  $('#start-question').addEventListener('click', () => act('startQuestion'));
  $('#end-session').addEventListener('click', () => {
    if (confirm('End this session and add completed-question points to the cumulative score? An unfinished question will not count.')) act('endSession');
  });
  $('#reset-room').addEventListener('click', () => {
    if (confirm('Reset the room? This clears players and all scores but keeps the question bank.')) act('resetRoom');
  });
  $('#players-list').addEventListener('click', (event) => {
    const swap = event.target.closest('[data-swap]');
    const remove = event.target.closest('[data-remove]');
    if (swap) act('swapTeam', { playerId: swap.dataset.swap });
    if (remove && confirm('Remove this player from the room?')) act('removePlayer', { playerId: remove.dataset.remove });
  });
  $('#resolve-answer').addEventListener('click', async () => {
    const answer = $('#override-answer').value.trim();
    try {
      await request('resolveAnswer', { answer });
      $('#override-answer').value = '';
      showMessage('');
    } catch (error) { showMessage(error.message); }
  });
  $('#override-answer').addEventListener('input', () => {
    const question = state?.session?.question;
    $('#resolve-answer').disabled = !question || !['playing', 'steal'].includes(question.status) || (!question.submission && !$('#override-answer').value.trim());
  });
  $('#clear-submission').addEventListener('click', () => act('clearSubmission'));
  $('#add-strike').addEventListener('click', () => act('addStrike'));
  $('#pass-control').addEventListener('click', () => act('passControl'));
  $('#skip-timer').addEventListener('click', () => act('skipTimer'));
  $('#next-question').addEventListener('click', () => act('nextQuestion'));
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
    if (answerRow && answerField) {
      const answerIndex = Number(answerRow.dataset.answer);
      editorQuestions[questionIndex].answers[answerIndex][answerField] = answerField === 'points' ? event.target.value : event.target.value;
    }
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
    const file = new Blob([JSON.stringify(state.questions, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = `christmas-feud-${state.code}-questions.json`;
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
})();