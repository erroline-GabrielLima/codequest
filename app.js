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
const profileList = document.querySelector('#profile-list');
const profileForm = document.querySelector('#profile-form');
const profileNameField = document.querySelector('#profile-name');
const selectedProfileLabel = document.querySelector('#profile-label');
const selectedProfileAvatar = document.querySelector('#profile-avatar');

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

function showProfileMessage(message, isError = false) {
  profileFeedback.textContent = message;
  profileFeedback.style.color = isError ? '#ff9e9e' : '';
}

function initials(name) {
  return (name.trim()[0] || '?').toLocaleUpperCase('pt-BR');
}

async function fetchProfiles() {
  const { data, error } = await supabase
    .from('game_profiles')
    .select('id, name')
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

function drawProfiles(profiles) {
  profileList.replaceChildren();
  for (const profile of profiles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profile-option';
    button.setAttribute('aria-label', `Entrar como ${profile.name}`);

    const avatar = document.createElement('span');
    avatar.className = 'profile avatar avatar-green';
    avatar.textContent = initials(profile.name);

    const name = document.createElement('span');
    name.className = 'profile-option-name';
    name.textContent = profile.name;

    button.append(avatar, name);
    button.addEventListener('click', () => activateProfile(profile));
    profileList.append(button);
  }
}

async function openProfilePicker() {
  showScreen('profiles');
  showProfileMessage('Carregando perfis…');

  try {
    let profiles = await fetchProfiles();
    if (profiles.length === 0) {
      const preferredName = currentUser.user_metadata?.display_name
        || currentUser.email?.split('@')[0]
        || 'Meu perfil';
      profiles = [await insertProfile(preferredName.slice(0, 32))];
    }

    drawProfiles(profiles);
    showProfileMessage('');
    const savedProfileId = localStorage.getItem(`codequest-profile-${currentUser.id}`);
    const savedProfile = profiles.find((profile) => profile.id === savedProfileId);
    if (savedProfile) activateProfile(savedProfile);
  } catch (error) {
    showProfileMessage(error.message || 'Não foi possível carregar os perfis.', true);
  }
}

function activateProfile(profile) {
  currentProfile = profile;
  localStorage.setItem(`codequest-profile-${currentUser.id}`, profile.id);
  selectedProfileLabel.textContent = profile.name;
  selectedProfileAvatar.textContent = initials(profile.name);

  const answerField = document.querySelector('#solution');
  const languageField = document.querySelector('#language');
  const savedDraft = localStorage.getItem(`codequest-week-01-${profile.id}`);
  if (savedDraft) {
    try {
      const draft = JSON.parse(savedDraft);
      answerField.value = draft.answer || '';
      languageField.value = draft.language || 'JavaScript';
    } catch {
      answerField.value = '';
    }
  } else {
    answerField.value = '';
    languageField.value = 'JavaScript';
  }

  showScreen('app');
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
    showAuthMessage(error.message || 'Não foi possível entrar. Confira os dados e tente novamente.', true);
  } finally {
    authSubmit.disabled = false;
  }
});

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = profileForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showProfileMessage('Criando perfil…');

  try {
    const profile = await insertProfile(profileNameField.value);
    profileNameField.value = '';
    const profiles = await fetchProfiles();
    drawProfiles(profiles);
    showProfileMessage('');
    activateProfile(profile);
  } catch (error) {
    showProfileMessage(error.message || 'Não foi possível criar o perfil.', true);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector('#active-profile').addEventListener('click', openProfilePicker);
document.querySelector('#logout-button').addEventListener('click', signOut);
document.querySelector('#header-logout').addEventListener('click', signOut);

document.querySelector('#submit-button').addEventListener('click', () => {
  const answerField = document.querySelector('#solution');
  const languageField = document.querySelector('#language');
  const feedback = document.querySelector('#feedback');
  const answer = answerField.value.trim();
  if (!answer) {
    feedback.textContent = 'Escreva sua solução ou cole um link antes de salvar.';
    answerField.focus();
    return;
  }

  localStorage.setItem(`codequest-week-01-${currentProfile.id}`, JSON.stringify({
    answer,
    language: languageField.value,
    savedAt: new Date().toISOString(),
  }));
  feedback.textContent = 'Rascunho salvo neste navegador. Boa missão!';
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
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      showScreen('auth');
      showAuthMessage('Você saiu da sua conta.');
    } else if (event === 'SIGNED_IN' && session?.user) {
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
