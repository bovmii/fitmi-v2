// Login / signup / password-reset screen.
//
// Modes:
//   'signin'  — existing user: email + password
//   'signup'  — new account: name + email + password (Supabase sends a
//               confirmation email before the account is usable, unless
//               email confirmation is disabled in the dashboard).
//   'forgot'  — request a password-reset email.
//   'recover' — landed from a reset email link; user must pick a new
//               password. Detected via #type=recovery in the URL hash.
//
// All writes go through core/auth.js so Supabase's session storage stays
// the single source of truth.

import { Auth } from '../../core/auth.js';
import { showToast } from '../../core/ui.js';

function escape(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function shell(bodyHtml) {
  return `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-logo">
          <span>fit</span><span class="accent">.mi</span>
        </div>
        <div class="auth-tagline">Body · Mind · Money</div>
        ${bodyHtml}
      </div>
    </div>
  `;
}

function formSignIn(state) {
  return shell(`
    <h1 class="auth-title">Connexion</h1>
    <p class="auth-subtitle">Ton email et ton mot de passe.</p>
    <form class="auth-form" data-form="signin" novalidate>
      <label class="auth-field">
        <span>Email</span>
        <input type="email" name="email" required autocomplete="email" value="${escape(state.email)}">
      </label>
      <label class="auth-field">
        <span>Mot de passe</span>
        <input type="password" name="password" required autocomplete="current-password" minlength="6">
      </label>
      ${state.info ? `<div class="auth-info">${escape(state.info)}</div>` : ''}
      ${state.error ? `<div class="auth-error">${escape(state.error)}</div>` : ''}
      <button type="submit" class="auth-submit">Se connecter</button>
      <div class="auth-links">
        <button type="button" data-goto="forgot" class="auth-link">Mot de passe oublié ?</button>
        <span class="auth-sep">·</span>
        <button type="button" data-goto="signup" class="auth-link">Créer un compte</button>
      </div>
    </form>
  `);
}

function formSignUp(state) {
  return shell(`
    <h1 class="auth-title">Créer un compte</h1>
    <p class="auth-subtitle">Un email valide, tu recevras un lien de confirmation.</p>
    <form class="auth-form" data-form="signup" novalidate>
      <label class="auth-field">
        <span>Prénom ou pseudo</span>
        <input type="text" name="name" required autocomplete="name" value="${escape(state.name)}">
      </label>
      <label class="auth-field">
        <span>Email</span>
        <input type="email" name="email" required autocomplete="email" value="${escape(state.email)}">
      </label>
      <label class="auth-field">
        <span>Mot de passe</span>
        <input type="password" name="password" required autocomplete="new-password" minlength="8">
        <small>8 caractères minimum.</small>
      </label>
      ${state.error ? `<div class="auth-error">${escape(state.error)}</div>` : ''}
      <button type="submit" class="auth-submit">Créer le compte</button>
      <div class="auth-links">
        <button type="button" data-goto="signin" class="auth-link">J'ai déjà un compte</button>
      </div>
    </form>
  `);
}

function formForgot(state) {
  return shell(`
    <h1 class="auth-title">Mot de passe oublié</h1>
    <p class="auth-subtitle">On t'envoie un lien de réinitialisation par email.</p>
    <form class="auth-form" data-form="forgot" novalidate>
      <label class="auth-field">
        <span>Email</span>
        <input type="email" name="email" required autocomplete="email" value="${escape(state.email)}">
      </label>
      ${state.error ? `<div class="auth-error">${escape(state.error)}</div>` : ''}
      ${state.info ? `<div class="auth-info">${escape(state.info)}</div>` : ''}
      <button type="submit" class="auth-submit">Envoyer le lien</button>
      <div class="auth-links">
        <button type="button" data-goto="signin" class="auth-link">Retour connexion</button>
      </div>
    </form>
  `);
}

function formRecover(state) {
  return shell(`
    <h1 class="auth-title">Nouveau mot de passe</h1>
    <p class="auth-subtitle">Choisis-en un nouveau.</p>
    <form class="auth-form" data-form="recover" novalidate>
      <label class="auth-field">
        <span>Nouveau mot de passe</span>
        <input type="password" name="password" required autocomplete="new-password" minlength="8">
      </label>
      <label class="auth-field">
        <span>Confirmer</span>
        <input type="password" name="confirm" required autocomplete="new-password" minlength="8">
      </label>
      ${state.error ? `<div class="auth-error">${escape(state.error)}</div>` : ''}
      <button type="submit" class="auth-submit">Mettre à jour</button>
    </form>
  `);
}

function translateError(err) {
  const msg = err?.message || String(err || '');
  if (/invalid login/i.test(msg)) return 'Email ou mot de passe incorrect.';
  if (/email not confirmed/i.test(msg)) return 'Email pas encore confirmé — vérifie ta boîte mail.';
  if (/user already registered/i.test(msg)) return 'Un compte existe déjà pour cet email.';
  if (/invalid email/i.test(msg)) return 'Adresse email invalide.';
  if (/password.*short/i.test(msg) || /at least.*characters/i.test(msg)) return 'Mot de passe trop court.';
  if (/rate limit/i.test(msg)) return 'Trop de tentatives — attends une minute.';
  return msg;
}

export function renderLogin(root) {
  let state = {
    mode: detectMode(),
    email: '',
    name: '',
    error: '',
    info: '',
    busy: false,
  };

  function render() {
    const html = (
      state.mode === 'signup'   ? formSignUp(state) :
      state.mode === 'forgot'   ? formForgot(state) :
      state.mode === 'recover'  ? formRecover(state) :
      formSignIn(state)
    );
    root.innerHTML = html;
    bind();
  }

  function bind() {
    root.querySelectorAll('[data-goto]').forEach((b) => {
      b.addEventListener('click', () => {
        state.error = '';
        state.info = '';
        state.mode = b.dataset.goto;
        render();
      });
    });
    const form = root.querySelector('form[data-form]');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.busy) return;
      state.busy = true;
      state.error = '';
      const fd = new FormData(form);
      const kind = form.dataset.form;
      try {
        if (kind === 'signin') {
          const { error } = await Auth.signIn({ email: fd.get('email').trim(), password: fd.get('password') });
          if (error) { state.error = translateError(error); state.email = fd.get('email').trim(); render(); }
          // Success: onAuthStateChange will swap the UI.
        } else if (kind === 'signup') {
          const { error } = await Auth.signUp({
            email: fd.get('email').trim(),
            password: fd.get('password'),
            name: fd.get('name').trim(),
          });
          if (error) {
            state.error = translateError(error);
            state.email = fd.get('email').trim();
            state.name = fd.get('name').trim();
            render();
          } else {
            state.mode = 'signin';
            state.info = 'Compte créé — vérifie ta boîte mail pour confirmer.';
            showToast('Compte créé — confirme par email.');
            render();
          }
        } else if (kind === 'forgot') {
          const { error } = await Auth.requestPasswordReset(fd.get('email').trim());
          if (error) {
            state.error = translateError(error);
          } else {
            state.info = 'Email envoyé. Regarde ta boîte de réception.';
          }
          state.email = fd.get('email').trim();
          render();
        } else if (kind === 'recover') {
          const pw = fd.get('password');
          const confirm = fd.get('confirm');
          if (pw !== confirm) { state.error = 'Les mots de passe ne correspondent pas.'; render(); return; }
          const { error } = await Auth.updatePassword(pw);
          if (error) { state.error = translateError(error); render(); return; }
          showToast('Mot de passe mis à jour.');
          // location.replace clears the recovery hash from history and
          // triggers a full boot with a clean URL.
          setTimeout(() => {
            window.location.replace(window.location.origin + window.location.pathname);
          }, 900);
        }
      } finally {
        state.busy = false;
      }
    });
  }

  render();
}

function detectMode() {
  const hash = window.location.hash || '';
  const query = window.location.search || '';
  if (hash.includes('type=recovery') || query.includes('reset') || hash === '#reset') return 'recover';
  return 'signin';
}
