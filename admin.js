import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.CODEQUEST_CONFIG || {};
if (config.url && config.publishableKey) {
  const supabase = createClient(config.url, config.publishableKey);
  const adminLink = document.querySelector('#admin-link');
  const adminPanel = document.querySelector('#admin-panel');
  const adminRoleLabel = document.querySelector('#admin-role-label');
  const challengeForm = document.querySelector('#admin-challenge-form');
  const challengeSelector = document.querySelector('#admin-challenge-selector');
  const reviewList = document.querySelector('#admin-review-list');
  const accountSection = document.querySelector('#admin-access-management');
  let currentUser = null;
  let currentProfile = null;
  let currentRole = null;
  let currentChallenge = null;
  let challenges = [];
  let editingChallengeId = null;

  function setFeedback(element, message, isError) {
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('admin-error', Boolean(isError));
    element.classList.toggle('admin-success', Boolean(message) && !isError);
  }

  function localDate(value) {
    if (!value) return '';
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function isoDate(value) {
    return value ? new Date(value).toISOString() : null;
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem prazo';
  }

  function durationLabel(milliseconds) {
    const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days) return days + 'd ' + hours + 'h';
    if (hours) return hours + 'h ' + minutes + 'min';
    return minutes + 'min';
  }

  function renderChallengeClock() {
    const countdown = document.querySelector('#challenge-countdown');
    const state = document.querySelector('#challenge-time-state');
    const publication = document.querySelector('#challenge-publication-state');
    const windowLabel = document.querySelector('#challenge-window-label');
    const submitButton = document.querySelector('#submit-button');
    if (!currentChallenge) {
      if (countdown) countdown.textContent = 'AGUARDANDO DESAFIO';
      if (state) state.textContent = 'Sem desafio publicado';
      if (publication) publication.textContent = 'SEM DESAFIO';
      if (windowLabel) windowLabel.textContent = '';
      if (submitButton) submitButton.disabled = true;
      window.CODEQUEST_ACTIVE_CHALLENGE_ID = null;
      window.CODEQUEST_CHALLENGE_OPEN = false;
      return;
    }

    const now = Date.now();
    const starts = currentChallenge.starts_at ? new Date(currentChallenge.starts_at).getTime() : null;
    const ends = currentChallenge.ends_at ? new Date(currentChallenge.ends_at).getTime() : null;
    const isOpen = (!starts || starts <= now) && (!ends || ends > now);
    const isUpcoming = starts && starts > now;
    window.CODEQUEST_ACTIVE_CHALLENGE_ID = currentChallenge.id;
    window.CODEQUEST_CHALLENGE_OPEN = Boolean(isOpen);

    if (windowLabel) {
      windowLabel.textContent = (starts ? 'Abre: ' + formatDate(currentChallenge.starts_at) : 'Disponível agora')
        + ' · ' + (ends ? 'Prazo: ' + formatDate(currentChallenge.ends_at) : 'Sem prazo final');
    }
    if (publication) publication.textContent = isOpen ? 'DESAFIO ABERTO' : (isUpcoming ? 'EM BREVE' : 'PRAZO ENCERRADO');
    if (countdown) {
      if (isUpcoming) countdown.textContent = 'ABRE EM ' + durationLabel(starts - now);
      else if (isOpen && ends) countdown.textContent = 'TERMINA EM ' + durationLabel(ends - now);
      else if (isOpen) countdown.textContent = 'SEM PRAZO FINAL';
      else countdown.textContent = 'ENCERRADO';
    }
    if (state) {
      if (isUpcoming) state.textContent = 'As respostas serão liberadas na abertura.';
      else if (isOpen && ends) state.textContent = 'Envios abertos até o prazo final.';
      else if (isOpen) state.textContent = 'Envios abertos.';
      else state.textContent = 'O prazo deste desafio terminou.';
    }
    if (submitButton) submitButton.disabled = !isOpen || !currentProfile;
  }

  function showNoChallenge() {
    currentChallenge = null;
    document.querySelector('#challenge-title').textContent = 'Aguardando próximo desafio';
    document.querySelector('#challenge-description').textContent = 'Ainda não há um desafio publicado.';
    document.querySelector('#challenge-difficulty').textContent = 'EM BREVE';
    document.querySelector('#challenge-example-input').textContent = '—';
    document.querySelector('#challenge-example-output').textContent = '—';
    renderChallengeClock();
  }

  async function loadProfileSubmission() {
    if (!currentProfile || !currentChallenge) return;
    const challengeId = currentChallenge.id;
    const profileId = currentProfile.id;
    const draftKey = 'codequest-' + challengeId + '-' + profileId;
    const solution = document.querySelector('#solution');
    const language = document.querySelector('#language');
    const status = document.querySelector('#feedback');

    try {
      const { data, error } = await supabase
        .from('challenge_submissions')
        .select('answer, language, status, review_feedback')
        .eq('profile_id', profileId)
        .eq('challenge_id', challengeId)
        .maybeSingle();

      if (error) throw error;
      if (currentProfile?.id !== profileId || currentChallenge?.id !== challengeId) return;

      if (data) {
        solution.value = data.answer;
        language.value = data.language;
        localStorage.setItem(draftKey, JSON.stringify({ answer: data.answer, language: data.language }));
        if (data.status === 'approved') status.textContent = 'Resposta aprovada. Ela já conta no placar.';
        else if (data.status === 'changes_requested') status.textContent = 'O educador pediu ajustes: ' + (data.review_feedback || 'revise sua resposta e reenvie.');
        else status.textContent = 'Sua resposta está aguardando revisão.';
        status.style.color = data.status === 'changes_requested' ? '#ffcf80' : '';
      } else {
        const draft = localStorage.getItem(draftKey);
        if (!draft) {
          solution.value = '';
          language.value = 'JavaScript';
        }
        status.textContent = '';
        status.style.color = '';
      }
    } catch {
      status.textContent = 'Não foi possível carregar seu envio salvo. Seu rascunho local continua disponível.';
      status.style.color = '#ff9e9e';
    }
  }

  async function loadStudentChallenge() {
    const { data, error } = await supabase
      .from('challenges')
      .select('id, title, description, difficulty, example_input, example_output, points, starts_at, ends_at, is_published')
      .eq('is_published', true)
      .limit(100);

    if (error) {
      showNoChallenge();
      document.querySelector('#challenge-description').textContent = 'Não foi possível carregar o desafio. Atualize a página.';
      return;
    }

    const rows = data || [];
    const now = Date.now();
    const open = rows.filter((challenge) =>
      (!challenge.starts_at || new Date(challenge.starts_at).getTime() <= now)
      && (!challenge.ends_at || new Date(challenge.ends_at).getTime() > now)
    ).sort((a, b) => {
      const aEnd = a.ends_at ? new Date(a.ends_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bEnd = b.ends_at ? new Date(b.ends_at).getTime() : Number.MAX_SAFE_INTEGER;
      return aEnd - bEnd;
    });
    const upcoming = rows.filter((challenge) => challenge.starts_at && new Date(challenge.starts_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const ended = rows.filter((challenge) => challenge.ends_at && new Date(challenge.ends_at).getTime() <= now)
      .sort((a, b) => new Date(b.ends_at).getTime() - new Date(a.ends_at).getTime());
    currentChallenge = open[0] || upcoming[0] || ended[0] || rows[0] || null;

    if (!currentChallenge) {
      showNoChallenge();
      return;
    }

    document.querySelector('#challenge-title').textContent = currentChallenge.title;
    document.querySelector('#challenge-description').textContent = currentChallenge.description;
    document.querySelector('#challenge-difficulty').textContent = currentChallenge.difficulty;
    document.querySelector('#challenge-example-input').textContent = currentChallenge.example_input;
    document.querySelector('#challenge-example-output').textContent = currentChallenge.example_output;
    renderChallengeClock();
    await loadProfileSubmission();
  }

  function clearChallengeForm() {
    editingChallengeId = null;
    challengeForm.reset();
    document.querySelector('#admin-challenge-title').value = '';
    document.querySelector('#admin-challenge-description').value = '';
    document.querySelector('#admin-challenge-points').value = '10';
    document.querySelector('#admin-example-input').value = '';
    document.querySelector('#admin-example-output').value = '';
    document.querySelector('#admin-challenge-start').value = '';
    document.querySelector('#admin-challenge-end').value = '';
    document.querySelector('#admin-challenge-published').checked = true;
    document.querySelector('#save-challenge-button').textContent = 'Criar desafio';
    challengeSelector.value = '';
  }

  function fillChallengeForm(challenge) {
    if (!challenge) return;
    editingChallengeId = challenge.id;
    document.querySelector('#admin-challenge-title').value = challenge.title || '';
    document.querySelector('#admin-challenge-description').value = challenge.description || '';
    document.querySelector('#admin-challenge-difficulty').value = challenge.difficulty || 'INICIANTE';
    document.querySelector('#admin-challenge-points').value = String(challenge.points ?? 10);
    document.querySelector('#admin-challenge-start').value = localDate(challenge.starts_at);
    document.querySelector('#admin-challenge-end').value = localDate(challenge.ends_at);
    document.querySelector('#admin-example-input').value = challenge.example_input || '';
    document.querySelector('#admin-example-output').value = challenge.example_output || '';
    document.querySelector('#admin-challenge-published').checked = Boolean(challenge.is_published);
    document.querySelector('#save-challenge-button').textContent = 'Salvar alterações';
  }

  function renderChallengeManager() {
    challengeSelector.replaceChildren();
    const list = document.querySelector('#admin-challenge-list');
    list.replaceChildren();

    if (challenges.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'admin-help';
      empty.textContent = 'Nenhum desafio criado ainda.';
      list.append(empty);
      clearChallengeForm();
      return;
    }

    for (const challenge of challenges) {
      const option = document.createElement('option');
      option.value = challenge.id;
      option.textContent = challenge.title + (challenge.is_published ? '' : ' (rascunho)');
      challengeSelector.append(option);

      const row = document.createElement('div');
      row.className = 'admin-challenge-row';
      const label = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = challenge.title;
      const meta = document.createElement('small');
      meta.textContent = challenge.is_published ? 'Publicado · ' + challenge.points + ' pontos · prazo ' + formatDate(challenge.ends_at) : 'Rascunho';
      label.append(title, meta);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'button button-secondary';
      edit.textContent = 'Editar';
      edit.addEventListener('click', () => {
        challengeSelector.value = challenge.id;
        fillChallengeForm(challenge);
      });
      row.append(label, edit);
      list.append(row);
    }

    if (editingChallengeId && challenges.some((item) => item.id === editingChallengeId)) {
      challengeSelector.value = editingChallengeId;
      fillChallengeForm(challenges.find((item) => item.id === editingChallengeId));
    } else {
      challengeSelector.value = challenges[0].id;
      fillChallengeForm(challenges[0]);
    }
  }

  async function loadChallengesForAdmin() {
    const { data, error } = await supabase
      .from('challenges')
      .select('id, title, description, difficulty, example_input, example_output, points, starts_at, ends_at, is_published')
      .order('id', { ascending: true });

    if (error) {
      setFeedback(document.querySelector('#challenge-feedback'), 'Não foi possível carregar os desafios.', true);
      return;
    }
    challenges = data || [];
    renderChallengeManager();
  }

  function statusLabel(status) {
    if (status === 'approved') return 'APROVADA';
    if (status === 'changes_requested') return 'AJUSTES PEDIDOS';
    return 'PENDENTE';
  }

  function renderReviewCard(submission, profileName, challenge) {
    const card = document.createElement('article');
    card.className = 'admin-review-card';

    const header = document.createElement('div');
    header.className = 'admin-review-header';
    const titleBlock = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'admin-review-title';
    title.textContent = profileName + ' · ' + (challenge?.title || 'Desafio');
    const meta = document.createElement('div');
    meta.className = 'admin-review-meta';
    meta.textContent = submission.language + ' · enviada em ' + formatDate(submission.submitted_at);
    titleBlock.append(title, meta);

    const badge = document.createElement('span');
    badge.className = 'admin-status';
    badge.textContent = statusLabel(submission.status);
    header.append(titleBlock, badge);

    const answer = document.createElement('pre');
    answer.className = 'admin-review-answer';
    answer.textContent = submission.answer;

    const feedbackLabel = document.createElement('label');
    feedbackLabel.className = 'field-label';
    feedbackLabel.textContent = 'COMENTÁRIO PARA O PARTICIPANTE';
    const feedbackBox = document.createElement('textarea');
    feedbackBox.maxLength = 2000;
    feedbackBox.placeholder = 'Explique o resultado da revisão ou o que precisa ser ajustado…';
    feedbackBox.value = submission.review_feedback || '';

    const actions = document.createElement('div');
    actions.className = 'admin-review-actions';
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'button button-primary';
    approve.textContent = 'Aprovar · +' + (challenge?.points || 0) + ' pts';
    const requestChanges = document.createElement('button');
    requestChanges.type = 'button';
    requestChanges.className = 'button button-secondary';
    requestChanges.textContent = 'Pedir ajustes';

    async function review(status) {
      const comment = feedbackBox.value.trim();
      if (status === 'changes_requested' && !comment) {
        setFeedback(document.querySelector('#admin-role-label'), 'Escreva o que deve ser ajustado antes de pedir uma correção.', true);
        feedbackBox.focus();
        return;
      }
      approve.disabled = true;
      requestChanges.disabled = true;
      const result = await supabase
        .from('challenge_submissions')
        .update({
          status,
          review_feedback: comment || null,
          reviewed_by: currentUser.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submission.id);
      if (result.error) {
        setFeedback(document.querySelector('#admin-role-label'), 'Falha ao salvar a revisão: ' + result.error.message, true);
        approve.disabled = false;
        requestChanges.disabled = false;
        return;
      }
      setFeedback(document.querySelector('#admin-role-label'), 'Revisão salva.', false);
      await loadReviewQueue();
      await loadStudentChallenge();
    }

    approve.addEventListener('click', () => review('approved'));
    requestChanges.addEventListener('click', () => review('changes_requested'));
    actions.append(approve, requestChanges);
    card.append(header, answer, feedbackLabel, feedbackBox, actions);
    return card;
  }

  async function loadReviewQueue() {
    const { data, error } = await supabase
      .from('challenge_submissions')
      .select('id, profile_id, challenge_id, answer, language, submitted_at, status, review_feedback')
      .order('submitted_at', { ascending: false })
      .limit(100);

    if (error) {
      reviewList.replaceChildren();
      const message = document.createElement('p');
      message.className = 'admin-error';
      message.textContent = 'Não foi possível carregar as respostas.';
      reviewList.append(message);
      return;
    }

    const submissions = data || [];
    reviewList.replaceChildren();
    if (submissions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'leaderboard-empty';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = 'Nenhuma resposta enviada ainda.';
      copy.append(title);
      empty.append(copy);
      reviewList.append(empty);
      return;
    }

    const profileIds = Array.from(new Set(submissions.map((row) => row.profile_id)));
    const challengeIds = Array.from(new Set(submissions.map((row) => row.challenge_id)));
    const [profilesResult, challengesResult] = await Promise.all([
      supabase.from('game_profiles').select('id, name').in('id', profileIds),
      supabase.from('challenges').select('id, title, points').in('id', challengeIds),
    ]);
    const profiles = new Map((profilesResult.data || []).map((row) => [row.id, row.name]));
    const challengeMap = new Map((challengesResult.data || []).map((row) => [row.id, row]));

    for (const submission of submissions) {
      reviewList.append(renderReviewCard(
        submission,
        profiles.get(submission.profile_id) || 'Perfil',
        challengeMap.get(submission.challenge_id)
      ));
    }
  }

  async function loadOwnerAccounts() {
    const result = await supabase.from('project_admins').select('user_id, role').order('created_at', { ascending: true });
    const profilesResult = await supabase.from('game_profiles').select('owner_id, name').order('created_at', { ascending: true });
    if (result.error || profilesResult.error) {
      setFeedback(document.querySelector('#admin-account-feedback'), 'Não foi possível carregar as contas.', true);
      return;
    }

    const names = new Map();
    for (const profile of profilesResult.data || []) {
      if (!names.has(profile.owner_id)) names.set(profile.owner_id, profile.name);
    }
    const admins = result.data || [];
    const selector = document.querySelector('#admin-user-selector');
    selector.replaceChildren();
    const alreadyAdded = new Set(admins.map((row) => row.user_id));
    for (const [userId, name] of names) {
      if (alreadyAdded.has(userId)) continue;
      const option = document.createElement('option');
      option.value = userId;
      option.textContent = name + ' · ' + userId.slice(0, 8);
      selector.append(option);
    }
    document.querySelector('#add-educator-button').disabled = selector.options.length === 0;

    const list = document.querySelector('#admin-account-list');
    list.replaceChildren();
    if (admins.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'admin-help';
      empty.textContent = 'Nenhuma conta administrativa cadastrada.';
      list.append(empty);
      return;
    }

    for (const admin of admins) {
      const row = document.createElement('div');
      row.className = 'admin-account-row';
      const text = document.createElement('span');
      text.textContent = (names.get(admin.user_id) || ('Conta ' + admin.user_id.slice(0, 8))) + ' · ' + (admin.role === 'owner' ? 'Dono' : 'Educador');
      row.append(text);
      if (admin.role === 'educator') {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'button button-secondary';
        remove.textContent = 'Remover acesso';
        remove.addEventListener('click', async () => {
          const { error } = await supabase.from('project_admins').delete().eq('user_id', admin.user_id);
          if (error) setFeedback(document.querySelector('#admin-account-feedback'), 'Não foi possível remover o acesso.', true);
          else {
            setFeedback(document.querySelector('#admin-account-feedback'), 'Acesso removido.', false);
            await loadOwnerAccounts();
          }
        });
        row.append(remove);
      }
      list.append(row);
    }
  }

  async function loadAdminDashboard() {
    if (!currentRole) return;
    adminRoleLabel.textContent = currentRole === 'owner' ? 'DONO' : 'EDUCADOR';
    accountSection.hidden = currentRole !== 'owner';
    await Promise.all([loadChallengesForAdmin(), loadReviewQueue()]);
    if (currentRole === 'owner') await loadOwnerAccounts();
  }

  async function setCurrentUser(user) {
    currentUser = user;
    currentRole = null;
    adminLink.hidden = true;
    adminPanel.hidden = true;
    if (!user) return;

    const { data, error } = await supabase
      .from('project_admins')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error || !data) return;

    currentRole = data.role;
    adminLink.hidden = false;
    if (!adminPanel.hidden) await loadAdminDashboard();
  }

  challengeSelector.addEventListener('change', () => {
    const selected = challenges.find((item) => item.id === challengeSelector.value);
    if (selected) fillChallengeForm(selected);
  });

  document.querySelector('#new-challenge-button').addEventListener('click', clearChallengeForm);
  document.querySelector('#refresh-reviews-button').addEventListener('click', loadReviewQueue);
  adminLink.addEventListener('click', () => {
    if (currentRole) void loadAdminDashboard();
  });

  challengeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(challengeForm);
    const points = Number(form.get('points'));
    const startsAt = isoDate(String(form.get('starts_at') || ''));
    const endsAt = isoDate(String(form.get('ends_at') || ''));
    const feedbackNode = document.querySelector('#challenge-feedback');
    if (!Number.isInteger(points) || points < 0 || points > 1000) {
      setFeedback(feedbackNode, 'Os pontos precisam ficar entre 0 e 1000.', true);
      return;
    }
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
      setFeedback(feedbackNode, 'O prazo final precisa ser posterior à abertura.', true);
      return;
    }

    const payload = {
      title: String(form.get('title') || '').trim(),
      description: String(form.get('description') || '').trim(),
      difficulty: String(form.get('difficulty') || 'INICIANTE'),
      points,
      starts_at: startsAt,
      ends_at: endsAt,
      example_input: String(form.get('example_input') || '').trim(),
      example_output: String(form.get('example_output') || '').trim(),
      is_published: document.querySelector('#admin-challenge-published').checked,
    };

    const result = editingChallengeId
      ? await supabase.from('challenges').update(payload).eq('id', editingChallengeId)
      : await supabase.from('challenges').insert({ ...payload, id: 'challenge-' + crypto.randomUUID() });
    if (result.error) {
      setFeedback(feedbackNode, 'Não foi possível salvar o desafio: ' + result.error.message, true);
      return;
    }
    setFeedback(feedbackNode, 'Desafio salvo.', false);
    await loadChallengesForAdmin();
    await loadStudentChallenge();
  });

  document.querySelector('#add-educator-button').addEventListener('click', async () => {
    const userId = document.querySelector('#admin-user-selector').value;
    if (!userId) return;
    const { error } = await supabase.from('project_admins').insert({ user_id: userId, role: 'educator' });
    if (error) setFeedback(document.querySelector('#admin-account-feedback'), 'Não foi possível adicionar o educador: ' + error.message, true);
    else {
      setFeedback(document.querySelector('#admin-account-feedback'), 'Educador adicionado.', false);
      await loadOwnerAccounts();
    }
  });

  window.addEventListener('codequest:profile-selected', (event) => {
    currentProfile = event.detail?.profile || null;
    void loadProfileSubmission();
    renderChallengeClock();
  });

  window.addEventListener('focus', () => {
    void loadStudentChallenge();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    void setCurrentUser(session?.user || null);
  });

  void supabase.auth.getSession().then(({ data }) => setCurrentUser(data.session?.user || null));
  void loadStudentChallenge();
  window.setInterval(renderChallengeClock, 15000);
}
