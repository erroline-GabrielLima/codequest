import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const authScreen = document.querySelector('#auth-screen');
const profileScreen = document.querySelector('#profile-screen');
const appShell = document.querySelector('#app-shell');
const authForm = document.querySelector('#auth-form');
const authFeedback = document.querySelector('#auth-feedback');
const profileFeedback = document.querySelector('#profile-feedback');
const loginTab = document.querySelector('#login-tab');
const signupTab = document.querySelector('#signup-tab');
const nameField = document.querySelector('#auth-name');
const authSubmit = document.querySelector('#auth-submit');
const selectedProfileLabel = document.querySelector('#profile-label');
const selectedProfileAvatar = document.querySelector('#profile-avatar');
const editProfileNameButton = document.querySelector('#edit-profile-name');
const profileNameDialog = document.querySelector('#profile-name-dialog');
const profileNameForm = document.querySelector('#profile-name-form');
const profileNameInput = document.querySelector('#profile-name-input');
const profileNameFeedback = document.querySelector('#profile-name-feedback');
const saveProfileNameButton = document.querySelector('#save-profile-name');
const forgotPasswordButton = document.querySelector('#forgot-password-button');
const passwordRecoveryDialog = document.querySelector('#password-recovery-dialog');
const passwordRecoveryForm = document.querySelector('#password-recovery-form');
const newPasswordInput = document.querySelector('#new-password');
const passwordRecoveryFeedback = document.querySelector('#password-recovery-feedback');
const saveNewPasswordButton = document.querySelector('#save-new-password');


let mode = 'login';
let supabase;
let currentUser;
let currentProfile;

function showScreen(screen) {
  authScreen.hidden = screen !== 'auth';
  profileScreen.hidden = screen !== 'profiles';
  appShell.hidden = screen !== 'app';
}

function setAuthMode(nextMode) {
  mode = nextMode;
  const signup = mode === 'signup';
  loginTab.classList.toggle('selected', !signup);
  signupTab.classList.toggle('selected', signup);
  loginTab.setAttribute('aria-selected', String(!signup));
  signupTab.setAttribute('aria-selected', String(signup));
  nameField.hidden = !signup;
  document.querySelector('label[for="auth-name"]').hidden = !signup;
  document.querySelector('#auth-password').autocomplete = signup ? 'new-password' : 'current-password';
  authSubmit.firstChild.textContent = signup ? 'Criar conta ' : 'Entrar ';
  authFeedback.textContent = '';
}

function showAuthMessage(message, isError = false) {
  authFeedback.textContent = message;
  authFeedback.style.color = isError ? '#ff9e9e' : '';
}

function authErrorMessage(error) {
  if (error.code === 'over_email_send_rate_limit' || error.message?.toLowerCase().includes('email rate limit exceeded')) {
    return 'O limite temporário de e-mails do Supabase foi atingido. Aguarde antes de pedir outro e-mail. Para envios mais frequentes, o projeto precisa de SMTP próprio.';
  }
  if (error.code === 'email_address_not_authorized') {
    return 'O envio padrão do Supabase só atende endereços autorizados. Para aceitar cadastros de amigos, configure um SMTP próprio.';
  }
  if (error.message?.toLowerCase().includes('redirect') || error.code === 'validation_failed') {
    return 'O link de recuperação não foi aceito. Confira se o endereço do site está cadastrado nas URLs permitidas do Supabase.';
  }

  return error.message || 'Não foi possível entrar. Confira os dados e tente novamente.';
}

function showProfileMessage(message, isError = false) {
  profileFeedback.textContent = message;
  profileFeedback.style.color = isError ? '#ff9e9e' : '';
}

function initials(name) {
  return (name.trim()[0] || '?').toLocaleUpperCase('pt-BR');
}

function renderLeaderboardState(container, message) {
  container.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'leaderboard-empty';
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = message;
  copy.append(title);
  empty.append(copy);
  container.append(empty);
}

function drawLeaderboard(entries) {
  const targets = [
    { list: document.querySelector('#auth-leaderboard-list'), count: document.querySelector('#auth-leaderboard-count') },
    { list: document.querySelector('#leaderboard-list'), count: document.querySelector('#leaderboard-count') },
  ];

  for (const target of targets) {
    if (!target.list || !target.count) continue;
    target.count.textContent = entries.length + (entries.length === 1 ? ' PARTICIPANTE' : ' PARTICIPANTES');
    target.list.replaceChildren();
    if (entries.length === 0) {
      renderLeaderboardState(target.list, 'Aguardando respostas aprovadas');
      continue;
    }
    entries.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'leaderboard-row';
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = String(index + 1).padStart(2, '0');
      const avatar = document.createElement('span');
      avatar.className = 'avatar avatar-green';
      avatar.textContent = initials(entry.profile_name);
      const name = document.createElement('span');
      name.className = 'player-name';
      name.textContent = entry.profile_name;
      const score = document.createElement('span');
      score.className = 'score';
      const total = document.createElement('span');
      total.textContent = String(entry.points);
      const label = document.createElement('small');
      label.textContent = ' pts';
      score.append(total, label);
      row.append(rank, avatar, name, score);
      target.list.append(row);
    });
  }
}

async function loadLeaderboard() {
  if (!supabase) return;

  const lists = [
    document.querySelector('#auth-leaderboard-list'),
    document.querySelector('#leaderboard-list'),
  ].filter(Boolean);

  try {
    const { data, error } = await supabase
      .from('challenge_leaderboard')
      .select('profile_name, points, approved_count, last_submitted_at')
      .order('points', { ascending: false })
      .order('last_submitted_at', { ascending: true })
      .limit(50);

    if (error) throw error;
    drawLeaderboard(data || []);
  } catch {
    for (const list of lists) {
      renderLeaderboardState(list, 'Não foi possível carregar o placar. Atualize a página para tentar novamente.');
    }
  }
}


async function fetchProfiles() {
  const { data, error } = await supabase
    .from('game_profiles')
    .select('id, name')
    .eq('owner_id', currentUser.id)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function insertProfile(name) {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 32) {
    throw new Error('Use um nome de perfil com até 32 caracteres.');
  }

  const { data, error } = await supabase
    .from('game_profiles')
    .insert({ owner_id: currentUser.id, name: cleanName })
    .select('id, name')
    .single();

  if (error) throw error;
  return data;
}

async function openProfilePicker() {
  showScreen('profiles');
  showProfileMessage('Preparando seu perfil…');

  try {
    let profiles = await fetchProfiles();
    let profile = profiles[0];

    if (!profile) {
      const preferredName = currentUser.user_metadata?.display_name
        || currentUser.email?.split('@')[0]
        || 'Meu perfil';
      profile = await insertProfile(preferredName.slice(0, 32));
    }

    await activateProfile(profile);
  } catch (error) {
    showProfileMessage(error.message || 'Não foi possível carregar seu perfil.', true);
  }
}

async function activateProfile(profile) {
  currentProfile = profile;
  localStorage.setItem('codequest-profile-' + currentUser.id, profile.id);
  selectedProfileLabel.textContent = profile.name;
  selectedProfileAvatar.textContent = initials(profile.name);

  const challengeId = window.CODEQUEST_ACTIVE_CHALLENGE_ID || 'week-01';
  const savedDraft = localStorage.getItem('codequest-' + challengeId + '-' + profile.id);
  const answerField = document.querySelector('#solution');
  const languageField = document.querySelector('#language');
  const feedback = document.querySelector('#feedback');

  if (savedDraft) {
    try {
      const draft = JSON.parse(savedDraft);
      answerField.value = draft.answer || '';
      languageField.value = draft.language || 'JavaScript';
    } catch {
      answerField.value = '';
      languageField.value = 'JavaScript';
    }
  } else {
    answerField.value = '';
    languageField.value = 'JavaScript';
  }

  feedback.textContent = '';
  feedback.style.color = '';
  showScreen('app');
  window.dispatchEvent(new CustomEvent('codequest:profile-selected', {
    detail: { profile, user: currentUser },
  }));
}

async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) showProfileMessage(error.message, true);
}

loginTab.addEventListener('click', () => setAuthMode('login'));
signupTab.addEventListener('click', () => setAuthMode('signup'));

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase) return;

  authSubmit.disabled = true;
  showAuthMessage(mode === 'signup' ? 'Criando sua conta…' : 'Entrando…');

  const form = new FormData(authForm);
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');

  try {
    if (mode === 'signup') {
      const displayName = String(form.get('name') || '').trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;
      if (data.session) {
        currentUser = data.user;
        await openProfilePicker();
      } else {
        showAuthMessage('Conta criada. Confira seu e-mail para confirmar e depois entre.');
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
      await openProfilePicker();
    }
  } catch (error) {
    showAuthMessage(authErrorMessage(error), true);
  } finally {
    authSubmit.disabled = false;
  }
});

document.querySelector('#logout-button').addEventListener('click', signOut);
document.querySelector('#header-logout').addEventListener('click', signOut);
editProfileNameButton.addEventListener('click', () => {
  if (!currentProfile) return;
  profileNameInput.value = currentProfile.name;
  profileNameFeedback.textContent = '';
  profileNameDialog.showModal();
});

document.querySelector('#cancel-profile-name').addEventListener('click', () => profileNameDialog.close());

profileNameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = profileNameInput.value.trim();
  if (!currentProfile || !name || name.length > 32) {
    profileNameFeedback.textContent = 'Use um nome entre 1 e 32 caracteres.';
    return;
  }

  saveProfileNameButton.disabled = true;
  profileNameFeedback.textContent = 'Salvando…';
  const { data, error } = await supabase
    .from('game_profiles')
    .update({ name })
    .eq('id', currentProfile.id)
    .select('id, name')
    .single();

  if (error) {
    profileNameFeedback.textContent = 'Não foi possível salvar o nome. Tente novamente.';
    saveProfileNameButton.disabled = false;
    return;
  }

  currentProfile = data;
  selectedProfileLabel.textContent = data.name;
  selectedProfileAvatar.textContent = initials(data.name);
  profileNameDialog.close();
  window.dispatchEvent(new CustomEvent('codequest:profile-name-updated', {
    detail: { profile: data, user: currentUser },
  }));
  await loadLeaderboard();
  saveProfileNameButton.disabled = false;
});

document.querySelector('#cancel-password-recovery').addEventListener('click', () => {
  passwordRecoveryDialog.close();
  showScreen('auth');
  showAuthMessage('Recuperação cancelada.');
});

forgotPasswordButton.addEventListener('click', async () => {
  const emailField = document.querySelector('#auth-email');
  const email = emailField.value.trim();
  if (!email) {
    showAuthMessage('Digite seu e-mail para receber o link de recuperação.', true);
    emailField.focus();
    return;
  }

  forgotPasswordButton.disabled = true;
  showAuthMessage('Enviando o link de recuperação…');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) showAuthMessage(authErrorMessage(error), true);
  else showAuthMessage('Se houver uma conta com esse e-mail, enviaremos um link para trocar a senha.');
  forgotPasswordButton.disabled = false;
});

passwordRecoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = newPasswordInput.value;
  if (password.length < 8) {
    passwordRecoveryFeedback.textContent = 'A senha precisa ter pelo menos 8 caracteres.';
    return;
  }

  saveNewPasswordButton.disabled = true;
  passwordRecoveryFeedback.textContent = 'Salvando…';
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) {
    passwordRecoveryFeedback.textContent = authErrorMessage(error);
    saveNewPasswordButton.disabled = false;
    return;
  }

  currentUser = data.user;
  newPasswordInput.value = '';
  passwordRecoveryDialog.close();
  await openProfilePicker();
  saveNewPasswordButton.disabled = false;
});


document.querySelector('#submit-button').addEventListener('click', async () => {
  const answerField = document.querySelector('#solution');
  const languageField = document.querySelector('#language');
  const feedback = document.querySelector('#feedback');
  const submitButton = document.querySelector('#submit-button');
  const answer = answerField.value.trim();
  const challengeId = window.CODEQUEST_ACTIVE_CHALLENGE_ID;
  const challengeOpen = window.CODEQUEST_CHALLENGE_OPEN !== false;

  if (!answer) {
    feedback.textContent = 'Escreva sua solução antes de enviar.';
    answerField.focus();
    return;
  }
  if (!currentUser || !currentProfile) {
    feedback.textContent = 'Entre e escolha um perfil para enviar sua solução.';
    feedback.style.color = '#ff9e9e';
    return;
  }
  if (!challengeId || !challengeOpen) {
    feedback.textContent = 'Este desafio ainda não abriu ou o prazo já terminou.';
    feedback.style.color = '#ff9e9e';
    return;
  }

  const draftKey = 'codequest-' + challengeId + '-' + currentProfile.id;
  localStorage.setItem(draftKey, JSON.stringify({
    answer,
    language: languageField.value,
    savedAt: new Date().toISOString(),
  }));
  submitButton.disabled = true;
  feedback.style.color = '';
  feedback.textContent = 'Enviando sua solução…';

  try {
    const { data: existingSubmission, error: lookupError } = await supabase
      .from('challenge_submissions')
      .select('id')
      .eq('profile_id', currentProfile.id)
      .eq('challenge_id', challengeId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existingSubmission) {
      const { data: updatedSubmission, error } = await supabase
        .from('challenge_submissions')
        .update({ answer, language: languageField.value })
        .eq('id', existingSubmission.id)
        .select('id')
        .single();
      if (error) throw error;
      if (!updatedSubmission) throw new Error('A resposta não foi atualizada. Confira se o prazo ainda está aberto.');
    } else {
      const { error } = await supabase
        .from('challenge_submissions')
        .insert({
          profile_id: currentProfile.id,
          challenge_id: challengeId,
          answer,
          language: languageField.value,
        });
      if (error) throw error;
    }
    localStorage.removeItem(draftKey);
    feedback.textContent = 'Resposta enviada para revisão. Ela entrará no placar após a aprovação.';
    await loadLeaderboard();
  } catch (error) {
    feedback.textContent = 'A resposta ainda não foi enviada para revisão. O rascunho está salvo apenas neste navegador. ' + (error.message || 'Tente novamente.');
    feedback.style.color = '#ff9e9e';
  } finally {
    submitButton.disabled = false;
  }
});

async function start() {
  const { url, publishableKey } = window.CODEQUEST_CONFIG || {};
  if (!url || !publishableKey || url.includes('COLE_') || publishableKey.includes('COLE_')) {
    showAuthMessage('Para ativar o login, falta configurar o projeto Supabase. Veja o README.', true);
    authSubmit.disabled = true;
    showScreen('auth');
    return;
  }

  supabase = createClient(url, publishableKey);
  void loadLeaderboard();
  window.setInterval(loadLeaderboard, 30000);
  window.addEventListener('focus', loadLeaderboard);
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      currentUser = session?.user || currentUser;
      showScreen('auth');
      passwordRecoveryFeedback.textContent = '';
      newPasswordInput.value = '';
      if (!passwordRecoveryDialog.open) passwordRecoveryDialog.showModal();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      showScreen('auth');
      showAuthMessage('Você saiu da sua conta.');
    } else if (event === 'SIGNED_IN' && session?.user) {
      if (window.location.hash.includes('type=recovery')) {
        currentUser = session.user;
        showScreen('auth');
        passwordRecoveryFeedback.textContent = '';
        if (!passwordRecoveryDialog.open) passwordRecoveryDialog.showModal();
        return;
      }
      window.setTimeout(() => {
        currentUser = session.user;
        openProfilePicker();
      }, 0);
    }
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    showAuthMessage('Não foi possível verificar sua sessão. Atualize a página.', true);
    showScreen('auth');
  } else if (data.session?.user) {
    currentUser = data.session.user;
    await openProfilePicker();
  } else {
    showScreen('auth');
  }
}

setAuthMode('login');
start();
