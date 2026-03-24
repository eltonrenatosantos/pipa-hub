import { supabase } from "../supabase.js";

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  return {
    snapshot_year: Number(snapshot.snapshot_year ?? snapshot.year ?? 0) || 0,
    snapshot_month: Number(snapshot.snapshot_month ?? snapshot.month ?? 0) || 0,
    month_start: snapshot.month_start || "",
    month_end: snapshot.month_end || "",
    dau_peak: Number(snapshot.dau_peak ?? snapshot.dau ?? 0) || 0,
    mau: Number(snapshot.mau ?? 0) || 0,
    new_users_month: Number(snapshot.new_users_month ?? 0) || 0,
    events_created_month: Number(snapshot.events_created_month ?? 0) || 0,
    total_event_views: Number(snapshot.total_event_views ?? 0) || 0,
    created_at: snapshot.created_at || "",
    updated_at: snapshot.updated_at || "",
  };
}

export async function ensureUsageMonthlySnapshot() {
  const { data, error } = await supabase.rpc("admin_ensure_usage_month_snapshot");
  if (error) {
    console.warn("admin_ensure_usage_month_snapshot:", error.message);
    return null;
  }

  return normalizeSnapshot(data?.snapshot ?? null);
}

function formatMonthLabel(year, month) {
  const safeYear = Number(year) || 0;
  const safeMonth = Number(month) || 0;
  const monthName = MONTHS_PT[safeMonth - 1] || "mês";
  return `${monthName} de ${safeYear || "—"}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
}

function buildSnapshotRows(snapshot) {
  const normalized = normalizeSnapshot(snapshot) || {};
  return [
    { label: "DAU (pico)", value: normalized.dau_peak },
    { label: "MAU", value: normalized.mau },
    { label: "Novos usuários", value: normalized.new_users_month },
    { label: "Eventos criados", value: normalized.events_created_month },
    { label: "Visualizações", value: normalized.total_event_views },
  ];
}

export function downloadUsageSnapshotPdf(snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  if (!normalized) return false;

  const title = `Snapshot mensal - ${formatMonthLabel(normalized.snapshot_year, normalized.snapshot_month)}`;
  const rows = buildSnapshotRows(normalized)
    .map(
      (row) => `
        <div class="row">
          <div class="label">${row.label}</div>
          <div class="value">${formatNumber(row.value)}</div>
        </div>
      `,
    )
    .join("");

  const capturedAt = normalized.created_at
    ? new Date(normalized.created_at).toLocaleString("pt-BR")
    : "";

  const html = `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title}</title>
      <style>
        :root{
          color-scheme: dark;
        }
        *{ box-sizing:border-box; }
        @page{
          size:A4 portrait;
          margin:6mm;
        }
        body{
          margin:0;
          padding:0;
          background:#0b0b0b;
          color:#f5f7fa;
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
          overflow:hidden;
        }
        .sheet{
          width:100%;
          max-width:100%;
          margin:0;
          background:linear-gradient(180deg,#171717 0%,#121212 100%);
          border:1px solid rgba(255,255,255,.08);
          border-radius:14px;
          padding:12px;
          box-shadow:0 14px 30px rgba(0,0,0,.28);
          page-break-inside:avoid;
          break-inside:avoid;
        }
        .kicker{
          color:#7dd3fc;
          font-size:9px;
          font-weight:800;
          letter-spacing:.08em;
          text-transform:uppercase;
        }
        h1{
          margin:6px 0 2px;
          font-size:18px;
          line-height:1.05;
          font-weight:900;
        }
        .meta{
          color:#a7adb8;
          font-size:9px;
          margin-bottom:8px;
        }
        .grid{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:6px;
        }
        .row{
          min-height:52px;
          border-radius:12px;
          border:1px solid rgba(94,184,255,.22);
          background:linear-gradient(180deg, rgba(94,184,255,.10) 0%, rgba(255,255,255,.03) 100%);
          padding:8px 10px;
          display:flex;
          flex-direction:column;
          justify-content:space-between;
          page-break-inside:avoid;
          break-inside:avoid;
        }
        .label{
          color:#b8bec8;
          font-size:8px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:.05em;
        }
        .value{
          font-size:17px;
          font-weight:900;
          line-height:1;
        }
        .footer{
          margin-top:8px;
          color:#8c93a1;
          font-size:8px;
        }
        @media print{
          body{ padding:0; background:#0b0b0b; overflow:hidden; }
          .sheet{
            border-radius:0;
            border:none;
            box-shadow:none;
            min-height:calc(100vh - 12mm);
          }
        }
      </style>
    </head>
    <body>
      <section class="sheet">
        <div class="kicker">WebPipa</div>
        <h1>${title}</h1>
        <div class="meta">Snapshot salvo em ${capturedAt || "data não informada"}</div>
        <div class="grid">${rows}</div>
        <div class="footer">Gerado pelo painel administrativo.</div>
      </section>
      <script>
        window.addEventListener('load', () => {
          setTimeout(() => {
            window.focus();
            window.print();
          }, 300);
        });
      </script>
    </body>
  </html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";

  const cleanup = () => {
    window.removeEventListener("afterprint", cleanup);
    iframe.remove();
  };

  iframe.onload = () => {
    try {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        cleanup();
        return;
      }

      window.addEventListener("afterprint", cleanup, { once: true });
      frameWindow.focus();
      frameWindow.print();
      return;
    } catch (_) {
      cleanup();
    }
  };

  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    cleanup();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();
  return true;
}
