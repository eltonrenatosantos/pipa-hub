/** Largura máxima do banner salvo (arte costuma ser horizontal). */
const MAX_WIDTH = 1200;
/** Qualidade JPEG após redimensionar — prioriza carregamento rápido sem degradar demais. */
const JPEG_QUALITY = 0.74;

/**
 * Redimensiona (se precisar) e exporta JPEG para data URL — alivia `home_advertising.image_url`.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function compressHomeAdImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith?.("image/")) {
      reject(new Error("Arquivo inválido"));
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w <= 0 || h <= 0) {
          reject(new Error("Imagem vazia"));
          return;
        }

        const scale = w > MAX_WIDTH ? MAX_WIDTH / w : 1;
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));

        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponível"));
          return;
        }
        ctx.drawImage(img, 0, 0, cw, ch);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Falha ao ler a imagem"));
    };

    img.src = url;
  });
}
