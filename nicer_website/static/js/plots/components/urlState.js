export const plotState = {
  requests: [],
};

function base64UrlEncode(str) {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function updateUrlWithState() {
  const params = new URLSearchParams();
  plotState.requests.forEach((req, i) => {
    const encoded = base64UrlEncode(req.query);
    params.set(`req${i}`, `${req.type}|b64:${encoded}`);
  });

  const mainObs = document.getElementById('observation-search')?.value;
  const searchType = document.getElementById('search-type')?.value;
  if (mainObs) params.set('obs_id', mainObs);
  if (searchType) params.set('obs_search', searchType);

  const query = params.toString();
  const newUrl = window.location.pathname + (query ? `?${query}` : '');
  window.history.replaceState(null, '', newUrl);
}

export function addPlotRequest(type, queryString) {
  const sanitizedQuery = queryString
    .replace(/&?csrfmiddlewaretoken=[^&]*/g, '')
    .replace(/^&/, '');
  const exists = plotState.requests.some(
    (request) => request.type === type && request.query === sanitizedQuery,
  );
  if (!exists) {
    plotState.requests.push({ type, query: sanitizedQuery });
    updateUrlWithState();
  }
}

export function clearPlotRequests() {
  plotState.requests = [];
  updateUrlWithState();
}

export function removePlotRequestByObsId(obsId) {
  const initialLength = plotState.requests.length;
  plotState.requests = plotState.requests.filter((request) => {
    const params = new URLSearchParams(request.query);
    const requestedObsIds = params.getAll('obs_id');
    const combinedObsIds = params.getAll('combined_obs_ids');
    if (requestedObsIds.includes(String(obsId))) return false;
    return !combinedObsIds.some((value) =>
      value.split(/[,\s]+/).includes(String(obsId)),
    );
  });
  if (plotState.requests.length !== initialLength) updateUrlWithState();
}

export function removePlotRequestByGti(obsId, gtiSearch) {
  if (!gtiSearch) return removePlotRequestByObsId(obsId);

  const initialLength = plotState.requests.length;
  plotState.requests = plotState.requests.filter((request) => {
    const params = new URLSearchParams(request.query);
    return !(
      params.get('obs_id') === String(obsId) &&
      params.get('gti-search') === String(gtiSearch)
    );
  });
  if (plotState.requests.length !== initialLength) updateUrlWithState();
  return undefined;
}
