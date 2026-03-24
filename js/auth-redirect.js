function isLocalWebOrigin() {
  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function normalizeUrl(input) {
  const currentUrl = new URL(input || window.location.href, window.location.origin);
  currentUrl.hash = "";
  return currentUrl.toString();
}

export function storeAuthReturnUrl(targetUrl = window.location.href) {
  localStorage.setItem("authReturnUrl", normalizeUrl(targetUrl));
}

export function consumeAuthReturnUrl(fallbackPath = "/pages/home.html") {
  const savedUrl = localStorage.getItem("authReturnUrl");
  localStorage.removeItem("authReturnUrl");

  if (!savedUrl) {
    return new URL(fallbackPath, window.location.origin).toString();
  }

  try {
    const savedTarget = new URL(savedUrl);
    if (savedTarget.origin !== window.location.origin) {
      return new URL(fallbackPath, window.location.origin).toString();
    }

    if (savedTarget.pathname.endsWith("/pages/auth-callback.html")) {
      return new URL(fallbackPath, window.location.origin).toString();
    }

    return savedTarget.toString();
  } catch {
    return new URL(fallbackPath, window.location.origin).toString();
  }
}

export function getAuthRedirectUrl(fallbackPath = "/pages/home.html") {
  if (isLocalWebOrigin()) {
    return new URL("/pages/auth-callback.html", window.location.origin).toString();
  }

  if (!fallbackPath) {
    return normalizeUrl(window.location.href);
  }

  return new URL(fallbackPath, window.location.origin).toString();
}
