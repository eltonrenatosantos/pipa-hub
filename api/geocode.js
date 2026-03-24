const DEFAULT_ERROR_MESSAGE =
  "Não foi possível localizar esse endereço. Revise rua, número e bairro.";

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function parseAddressParts(location) {
  const parts = String(location || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    parts,
    street: parts[0] || "",
    number: parts[1] || "",
    neighborhood: parts[2] || "",
  };
}

function isCompleteAddress(location) {
  const { parts, street, number, neighborhood } = parseAddressParts(location);

  if (parts.length < 3) return false;
  if (!street || !number || !neighborhood) return false;
  if (!/\d/.test(number)) return false;
  return true;
}

async function fetchCep(cep) {
  const cleanCep = onlyDigits(cep);
  if (cleanCep.length !== 8) {
    throw new Error("Informe um CEP válido com 8 números.");
  }

  const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
  const data = await response.json();

  if (!response.ok || data?.erro) {
    throw new Error("CEP não encontrado. Revise o número informado.");
  }

  return {
    cep: cleanCep,
    street: String(data.logradouro || "").trim(),
    neighborhood: String(data.bairro || "").trim(),
    city: String(data.localidade || "").trim(),
    uf: String(data.uf || "").trim(),
  };
}

function getGoogleGeocodingApiKey() {
  return String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
}

function getGoogleAddressComponents(result) {
  const components = Array.isArray(result?.address_components)
    ? result.address_components
    : [];
  const valuesByType = {};

  for (const component of components) {
    const types = Array.isArray(component?.types) ? component.types : [];
    const values = [
      String(component?.long_name || "").trim(),
      String(component?.short_name || "").trim(),
    ].filter(Boolean);

    for (const type of types) {
      const safeType = String(type || "").trim();
      if (!safeType) continue;
      valuesByType[safeType] ||= [];
      for (const value of values) {
        if (!valuesByType[safeType].includes(value)) {
          valuesByType[safeType].push(value);
        }
      }
    }
  }

  return valuesByType;
}

function hasMatchingValue(values, expected) {
  const normalizedExpected = normalizeText(expected);
  if (!normalizedExpected) return false;

  return (values || []).some((value) => {
    const normalizedValue = normalizeText(value);
    return (
      normalizedValue === normalizedExpected ||
      normalizedValue.includes(normalizedExpected) ||
      normalizedExpected.includes(normalizedValue)
    );
  });
}

function hasMatchingPostalCode(values, expectedCep) {
  const normalizedExpected = onlyDigits(expectedCep);
  if (!normalizedExpected) return false;

  return (values || []).some((value) => onlyDigits(value) === normalizedExpected);
}

function googleResultMatchesCep(result, { street, neighborhood, city, uf, cep }) {
  const valuesByType = getGoogleAddressComponents(result);
  const formattedAddress = normalizeText(result?.formatted_address || "");

  const routeValues = valuesByType.route || [];
  const neighborhoodValues = [
    ...(valuesByType.neighborhood || []),
    ...(valuesByType.sublocality || []),
    ...(valuesByType.sublocality_level_1 || []),
    ...(valuesByType.sublocality_level_2 || []),
    ...(valuesByType.administrative_area_level_3 || []),
  ];
  const cityValues = [
    ...(valuesByType.locality || []),
    ...(valuesByType.postal_town || []),
    ...(valuesByType.administrative_area_level_2 || []),
  ];
  const ufValues = [...(valuesByType.administrative_area_level_1 || [])];
  const postalValues = valuesByType.postal_code || [];

  const normalizedStreet = normalizeText(street);
  const normalizedNeighborhood = normalizeText(neighborhood);
  const normalizedCity = normalizeText(city);
  const normalizedUf = normalizeText(uf);

  const streetMatches =
    !normalizedStreet ||
    hasMatchingValue(routeValues, normalizedStreet) ||
    formattedAddress.includes(normalizedStreet);
  if (!streetMatches) return false;

  if (normalizedNeighborhood) {
    const neighborhoodMatches =
      hasMatchingValue(neighborhoodValues, normalizedNeighborhood) ||
      formattedAddress.includes(normalizedNeighborhood);
    if (!neighborhoodMatches) return false;
  }

  const cityMatches =
    !normalizedCity ||
    hasMatchingValue(cityValues, normalizedCity) ||
    formattedAddress.includes(normalizedCity);
  if (!cityMatches) return false;

  const ufMatches =
    !normalizedUf ||
    hasMatchingValue(ufValues, normalizedUf) ||
    formattedAddress.includes(normalizedUf);
  if (!ufMatches) return false;

  const cepMatches =
    !cep ||
    hasMatchingPostalCode(postalValues, cep) ||
    formattedAddress.includes(onlyDigits(cep));

  return cepMatches;
}

function scoreGoogleResult(result, expected) {
  if (!googleResultMatchesCep(result, expected)) return -1;

  const valuesByType = getGoogleAddressComponents(result);
  const locationType = String(result?.geometry?.location_type || "").toUpperCase();
  let score = 0;

  if (valuesByType.route?.length) score += 100;
  if (valuesByType.locality?.length || valuesByType.postal_town?.length) score += 25;
  if (valuesByType.neighborhood?.length || valuesByType.sublocality?.length) score += 25;
  if (valuesByType.administrative_area_level_1?.length) score += 15;
  if (valuesByType.postal_code?.length) score += 10;

  switch (locationType) {
    case "ROOFTOP":
      score += 40;
      break;
    case "RANGE_INTERPOLATED":
      score += 30;
      break;
    case "GEOMETRIC_CENTER":
      score += 20;
      break;
    case "APPROXIMATE":
      score += 10;
      break;
    default:
      break;
  }

  return score;
}

async function geocodeAddress({ city, location, cep = "", uf = "" }) {
  if (!isCompleteAddress(location)) {
    return { ok: true, lat: null, lng: null, place: null };
  }

  const apiKey = getGoogleGeocodingApiKey();
  if (!apiKey) {
    return {
      ok: false,
      message: "Defina GOOGLE_MAPS_API_KEY no backend para localizar o endereço.",
    };
  }

  const parsedLocation = parseAddressParts(location);
  const cleanCep = onlyDigits(cep);
  let cepData = null;

  if (cleanCep) {
    try {
      cepData = await fetchCep(cleanCep);
    } catch (error) {
      return {
        ok: false,
        message: String(error?.message || error || DEFAULT_ERROR_MESSAGE),
      };
    }
  }

  const effectiveStreet = String(cepData?.street || parsedLocation.street || "").trim();
  const effectiveNeighborhood = String(
    cepData?.neighborhood || parsedLocation.neighborhood || "",
  ).trim();
  const effectiveCity = String(cepData?.city || city || "").trim();
  const effectiveUf = String(cepData?.uf || uf || "").trim();
  const regionParts = [effectiveCity, effectiveUf].filter(Boolean);
  const regionSuffix = regionParts.length ? `${regionParts.join(", ")}, Brasil` : "Brasil";
  const streetOnlyLocation = [effectiveStreet, effectiveNeighborhood, effectiveCity, effectiveUf]
    .filter(Boolean)
    .join(", ");

  const attempts = cleanCep
    ? [
        `${location}, ${regionSuffix}`,
        `${streetOnlyLocation}, ${regionSuffix}`,
        `${parsedLocation.street}, ${regionSuffix}`,
      ]
    : [`${location}, ${regionSuffix}`, `${location}, Brasil`];

  let bestResult = null;
  let bestScore = -1;

  for (const attempt of attempts) {
    if (!attempt.trim()) continue;

    const params = new URLSearchParams({
      address: attempt,
      language: "pt-BR",
      region: "br",
      key: apiKey,
      components: cleanCep
        ? `country:BR|postal_code:${cleanCep}`
        : "country:BR",
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
    );
    const data = await response.json();

    const status = String(data?.status || "").trim();
    if (status === "ZERO_RESULTS") {
      continue;
    }
    if (status && status !== "OK") {
      const errorMessage = String(data?.error_message || "").trim();
      return {
        ok: false,
        message: errorMessage || `Google Geocoding retornou ${status}.`,
      };
    }
    if (!response.ok || !Array.isArray(data?.results) || !data.results.length) {
      continue;
    }

    for (const result of data.results) {
      const score = scoreGoogleResult(result, {
        street: effectiveStreet,
        neighborhood: effectiveNeighborhood,
        city: effectiveCity,
        uf: effectiveUf,
        cep: cleanCep,
      });

      if (score <= bestScore) continue;

      const lat = Number(result?.geometry?.location?.lat);
      const lng = Number(result?.geometry?.location?.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

      bestScore = score;
      bestResult = {
        lat,
        lng,
        place: String(result?.formatted_address || "").trim() || null,
      };
    }
  }

  if (!bestResult) {
    return { ok: false, message: DEFAULT_ERROR_MESSAGE };
  }

  return { ok: true, ...bestResult };
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    if (String(req.query?.debug || "") === "1") {
      const apiKey = getGoogleGeocodingApiKey();
      res.status(200).json({
        ok: true,
        runtime: "vercel",
        hasKey: Boolean(apiKey),
        keyLength: apiKey.length,
        projectEnv: String(process.env.VERCEL_ENV || ""),
      });
      return;
    }

    res.status(200).json({
      ok: true,
      runtime: "vercel",
      message: "Use POST para geocodificar um endereço.",
    });
    return;
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Método não permitido." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const result = await geocodeAddress(body);

    if (!result.ok) {
      res.status(422).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    const message = String(error?.message || error || DEFAULT_ERROR_MESSAGE);
    res.status(500).json({ ok: false, message });
  }
}

module.exports = handler;
