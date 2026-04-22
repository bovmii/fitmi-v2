// Small modal to change the password once logged in. Opened from the
// user pill in the header. Uses core/ui.js confirmModal styling
// primitives so it blends with the rest of the app.

import { Auth } from '../../core/auth.js';
import { showToast } from '../../core/ui.js';

export function openPasswordChange() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <form class="modal-box auth-form" style="width:100%;max-width:360px;">
        <h2 style="margin-bottom:6px;font-family:'Outfit',sans-serif;font-size:22px;">Changer le mot de passe</h2>
        <p class="muted" style="margin-bottom:14px;">Choisis un nouveau mot de passe.</p>
        <label class="auth-field">
          <span>Nouveau mot de passe</span>
          <input type="password" name="pw" required minlength="8" autocomplete="new-password">
        </label>
        <label class="auth-field">
          <span>Confirmer</span>
          <input type="password" name="confirm" required minlength="8" autocomplete="new-password">
        </label>
        <div class="auth-error" data-error style="display:none;"></div>
        <div class="modal-buttons" style="margin-top:14px;">
          <button type="button" class="modal-cancel" data-cancel>Annuler</button>
          <button type="submit" class="modal-confirm">Mettre à jour</button>
        </div>
      </form>
    `;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('form');
    const errorEl = overlay.querySelector('[data-error]');
    const close = (ok) => { overlay.remove(); resolve(ok); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    overlay.querySelector('[data-cancel]').onclick = () => close(false);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const pw = fd.get('pw');
      const confirm = fd.get('confirm');
      errorEl.style.display = 'none';
      if (pw !== confirm) {
        errorEl.textContent = 'Les mots de passe ne correspondent pas.';
        errorEl.style.display = 'block';
        return;
      }
      const { error } = await Auth.updatePassword(pw);
      if (error) {
        errorEl.textContent = error.message || 'Erreur.';
        errorEl.style.display = 'block';
        return;
      }
      showToast('Mot de passe mis à jour.');
      close(true);
    });
  });
}
