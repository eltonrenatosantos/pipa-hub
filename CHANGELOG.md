# Changelog

Registro de alterações relevantes do WebPipa / pipa-hub (PWA).  
*(Arquivo criado na raiz em 2026-03-22 — não havia changelog anterior no repositório.)*

---

## [Em desenvolvimento] — 2026-03-23

### Publicidade (banner) — PWA alinhado ao que replicar no Flutter

- **Telas com o mesmo banner e mesma métrica**: Home, **Mapa** e **Ranking** (`js/ui/homeAdBanner.js`, `initHomeAdBanner`). Impressões e cliques somam na mesma tabela (`home_ad_events` / `record_home_ad_event`); o admin **não** separa por tela.
- **Loader**: primeira arte com `loading="eager"`; `waitForHomeAdImage` antes de soltar o overlay; `page-loader` com fallback **15s**; home/map/ranking aguardam o banner quando há campanha.
- **Compressão no admin**: `js/utils/compressHomeAdImage.js` — upload redimensiona (largura máx. 1200px) e exporta **JPEG ~82%** antes de gravar em `image_url`.
- **Espaçamento**: margem entre slot do anúncio e conteúdo no mapa/ranking (`.home-ad-slot` + irmão); layout mapa em coluna flex (`layout-map-page`) + `invalidateSize` após o banner.

### Admin — métricas, navegação e layout

- **Métricas da campanha (ⓘ)**: popup tipo dashboard (`showHomeAdStatsPopup` em `js/ui/popup.js` + estilos em `pages.css`).
- **Voltar**: botão **só seta**, flutuante no estilo do evento (`event-back-btn`); `aria-label` / `title` mantidos. Padding compacto quando **sem header** (`html.app-layout--no-header` + regras em `pages.css`); removido “espaço gigante” que somava `--app-header-bar-height` sem barra visível.
- **Header opcional**: `APP_SHOW_HEADER` em `js/header.js` — `false` esconde a barra global (teste / prod conforme flag).

### Perfil

- **Conta**: card de resumo como ponto único de **Entrar** (Google) ou **Sair** (sheet ao tocar no avatar); texto e ícone para visitante.

### Mapa — card de evento

- Mais **padding** no bloco de texto (título/data/endereço); **largura** do card ~**+10%** (desktop e mobile).

### Ranking

- Título do hero: **“As melhores do Brasil”** (`pages/ranking.html`).

### Referência rápida para Flutter (paridade)

| Área | Onde olhar no repo |
|------|-------------------|
| Lista de campanhas ativas | `js/services/advertising.js` |
| Banner + rotação + impressão/clique | `js/ui/homeAdBanner.js`, `js/services/homeAdAnalytics.js` |
| SQL eventos / stats admin | `sql/home_ad_analytics.sql`, `sql/home_advertising.sql` |
| Loader global | `js/ui/page-loader.js` |
| Compressão arte | `js/utils/compressHomeAdImage.js` |

---

## [Em desenvolvimento] — 2026-03-22

### Admin, equipes, usuários e resets (notas do projeto)

- Alterações extensas na área **admin**; inclusão de **fluxos e telas novas**.
- **Mapa**: muitas mudanças (UX, busca, pins, clusters, card, mobile, etc.).
- Lógica de **criação de equipes**; **aprovações** (cadastro e alterações de perfil).
- **Exclusão de equipes** e ações associadas no painel.
- **Botões de reset**; **reset geral** do sistema (dados / Supabase conforme SQL aplicado).
- **Gerenciamento de usuários** no admin.
- **Gerenciamento de equipes “inteiras”** (visão completa / ações por equipe).
- Lógica do **RAW** unificada: consolidada num único fluxo, alinhada a **INT** (detalhes nos RPCs/SQL do ranking).
- **Ordem dos destaques** (maiores / menores) ajustada na UI ou na query.
- Nas equipes, exibição focada: apenas **MB** e **INT** para visualização pelos membros (demais campos ocultos ou removidos da UI).
- **Destacar eventos gratuitos**: agora é possível (regra + UI; ver `is_highlighted` / planos / admin).

### Mapa, busca e PWA (sessão Cursor — referência técnica)

- Busca no mapa com filtro **no cliente**; um resultado com busca ativa **abre o card** automaticamente.
- **Cluster / mesmo endereço**: foco e card usam coordenadas do **evento** (`getEventLatLng`), não só `marker.getLatLng()` (spiderfy).
- **iOS**: input de busca ≥16px, `100dvh` no container, card menor em telas estreitas; sem `loadEvents` ao esvaziar o campo no `input` (evita mapa “pular”).
- **Ranking**: RPC/listagem priorizando equipes **aprovadas** (ver `sql/ranking_only_approved_teams.sql` se aplicado).
- **Admin — reset do sistema**: textos da tela em **pt-BR** (`pages/admin.html`).
- **Vercel**: deploy Preview ≠ Production; uso de `--prod` ou promote para URL principal.
- **Service worker** / `?v=` nos assets: lembrar versionamento ao depurar cache no celular.

### Equipe — nome em todo o app + “uma alteração” de identidade

- SQL `sql/team_profile_identity_and_events_sync.sql`: coluna `identity_profile_changes_remaining` (ficha única para mudar **nome + região + data de fundação** após aprovação); **cidade e logo** não consomem essa ficha.
- Ao **aprovar** alteração de perfil com nome novo: atualiza `events.team` para eventos da equipe (via `events.team_id` se existir; senão por texto antigo + `user_id` membro).
- Perfil (`pages/profile.html`): campo **data de fundação**, aviso no sheet, confirmação antes de enviar se mexer em identidade; campos de identidade **somente leitura** quando a ficha já foi usada.

---

*(Adicione novas entradas acima desta linha, sem apagar o histórico abaixo.)*
