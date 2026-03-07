const footer = `
<footer class="footer">
  <div class="footer-icons">

    <!-- Eventos -->
    <div class="nav-item" data-page="events" onclick="location.href='home.html'">
      <div class="icon icon-home">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 10.5L12 3l9 7.5"></path>
          <path d="M5 10v10h14V10"></path>
        </svg>
      </div>
      <span class="label">Eventos</span>
    </div>

    <!-- Mapa -->
    <div class="nav-item" data-page="map" onclick="location.href='map.html'">
      <div class="icon icon-map">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 21s6-5.5 6-10a6 6 0 10-12 0c0 4.5 6 10 6 10z"></path>
          <circle cx="12" cy="11" r="2"></circle>
        </svg>
      </div>
      <span class="label">Mapa</span>
    </div>

    <!-- Divulgar evento -->
    <div class="nav-item center" data-page="publish" onclick="location.href='publish.html'">
      <div class="icon icon-plus">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
    </div>

    <!-- Ranking -->
    <div class="nav-item" data-page="ranking" onclick="location.href='ranking.html'">
      <div class="icon icon-trophy">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 21h8"></path>
          <path d="M12 17v4"></path>
          <path d="M5 3h14v4a7 7 0 01-14 0V3z"></path>
          <path d="M3 5h2a5 5 0 005 5"></path>
          <path d="M21 5h-2a5 5 0 01-5 5"></path>
        </svg>
      </div>
      <span class="label">Ranking</span>
    </div>

    <!-- Perfil -->
    <div class="nav-item" data-page="profile" onclick="location.href='profile.html'">
      <div class="icon icon-user">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="8" r="4"></circle>
          <path d="M4 21c2-4 6-6 8-6s6 2 8 6"></path>
        </svg>
      </div>
      <span class="label">Perfil</span>
    </div>

  </div>
</footer>
`;

const container = document.getElementById("app-footer");
if (container) {
  container.innerHTML = footer;
}