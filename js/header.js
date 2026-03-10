// /js/header.js

import { supabase } from "./supabase.js";

export async function loadHeader(title){

  const container = document.getElementById("app-header");
  if(!container) return;

  const { data: { user } } = await supabase.auth.getUser();

  let userHTML = `
    <span class="header-login-btn" id="header-login-btn">Entrar</span>
  `;

  if(user){
    const avatar = user.user_metadata?.avatar_url || "";
    const name = user.user_metadata?.name || "Usuário";

    userHTML = `
      <div class="header-user" id="header-user-btn">
        <img src="${avatar}" class="header-avatar">
        <span class="header-name">${name}</span>

        <div class="header-dropdown" id="header-dropdown" style="display:none;">
          <div class="header-dropdown-item" id="header-profile">Meu perfil</div>
          <div class="header-dropdown-item" id="header-logout">Sair</div>
        </div>
      </div>
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
  const dropdown = document.getElementById("header-dropdown");

  if(loginBtn){
    loginBtn.onclick = async ()=>{
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.href
        }
      });
    };
  }

  if(userBtn && dropdown){

    userBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", ()=>{
      dropdown.style.display = "none";
    });

    const profileBtn = document.getElementById("header-profile");
    const logoutBtn = document.getElementById("header-logout");

    if(profileBtn){
      profileBtn.onclick = ()=>{
        window.location.href = "/pages/profile.html";
      };
    }

    if(logoutBtn){
      logoutBtn.onclick = async ()=>{
        await supabase.auth.signOut();
        window.location.reload();
      };
    }

  }
}