// /js/header.js

import { supabase } from "./supabase.js";
import { getAuthRedirectUrl, storeAuthReturnUrl } from "./auth-redirect.js";
import { closePopup, showPopup } from "./ui/popup.js";

/**
 * Barra superior (título + login/conta) em todas as páginas que chamam `loadHeader`.
 * `false` = teste sem header (footer e navegação continuam).
 * Reverter: mude para `true` e recarregue (Cmd+Shift+R se o cache segurar o JS).
 */
export const APP_SHOW_HEADER = false;

export async function loadHeader(title){
  const container = document.getElementById("app-header");
  if(!container) return;

  if(!APP_SHOW_HEADER){
    document.documentElement.classList.add("app-layout--no-header");
    container.innerHTML = "";
    container.hidden = true;
    container.setAttribute("aria-hidden", "true");
    return;
  }

  document.documentElement.classList.remove("app-layout--no-header");
  container.hidden = false;
  container.removeAttribute("aria-hidden");

  const { data: { user } } = await supabase.auth.getUser();

  let userHTML = `
    <button class="header-account-trigger header-account-trigger--guest" id="header-login-btn" type="button" aria-label="Entrar">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="8" r="4"></circle>
        <path d="M4 21c2-4 6-6 8-6s6 2 8 6"></path>
      </svg>
    </button>
  `;

  if(user){
    const avatar = user.user_metadata?.avatar_url || "";

    userHTML = `
      <button class="header-user header-account-trigger" id="header-user-btn" type="button" aria-label="Sua conta">
        ${avatar
          ? `<img src="${avatar}" class="header-avatar" alt="Foto do perfil">`
          : `<span class="header-avatar header-avatar-fallback" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="8" r="4"></circle>
                <path d="M4 21c2-4 6-6 8-6s6 2 8 6"></path>
              </svg>
            </span>`
        }
      </button>
    `;
  }

  container.innerHTML = `
    <div class="app-header-bar">

      <div class="header-title">
        ${title}
      </div>

      <div class="header-right">
        ${userHTML}
      </div>

    </div>
  `;

  const userBtn = document.getElementById("header-user-btn");
  const loginBtn = document.getElementById("header-login-btn");

  if(loginBtn){
    loginBtn.onclick = async ()=>{
      storeAuthReturnUrl();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAuthRedirectUrl()
        }
      });
    };
  }

  if(userBtn && user){
    userBtn.addEventListener("click", ()=>{
      const email = user.email || "Usuário conectado";
      const { overlay } = showPopup({
        title: "Sua conta",
        message: email,
        bottomSheet: true,
        align: "left",
        actions: `
          <button class="app-popup-button" type="button" data-role="profile">Meu perfil</button>
          <button class="app-popup-button app-popup-secondary" type="button" data-role="logout">Sair</button>
        `
      });

      overlay.querySelector('[data-role="profile"]')?.addEventListener("click", ()=>{
        closePopup(overlay);
        window.location.href = "/pages/profile.html";
      });

      overlay.querySelector('[data-role="logout"]')?.addEventListener("click", async ()=>{
        closePopup(overlay);
        await supabase.auth.signOut();
        window.location.reload();
      });
    });
  }
}
