/* RailSync AI - API Service Layer */

window.RailSyncAPI = (function () {
  'use strict';

  const API_BASE = (window.RAILSYNC_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');

  async function parseError(response, fallback) {
    try {
      const body = await response.json();
      if (body && (body.error || body.detail)) {
        return [body.detail, body.error].filter(Boolean).join(': ');
      }
    } catch (_err) {
      /* non-JSON error body */
    }
    return fallback || ('HTTP ' + response.status);
  }

  async function request(path, options) {
    const response = await fetch(API_BASE + path, options);
    return response;
  }

  async function fetchTasks() {
    try {
      const response = await request('/tasks', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: await parseError(response, 'GET /tasks failed (HTTP ' + response.status + ')')
        };
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        return { ok: false, status: response.status, error: 'GET /tasks returned an unexpected response' };
      }
      return { ok: true, data: data };
    } catch (err) {
      return { ok: false, status: 0, error: 'Backend unavailable for GET /tasks (' + err.message + ')' };
    }
  }

  async function generatePlan() {
    try {
      const response = await request('/plan/generate', {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: await parseError(response, 'POST /plan/generate failed (HTTP ' + response.status + ')')
        };
      }
      const data = await response.json();
      if (!data || !data.schedule_id) {
        return { ok: false, status: response.status, error: 'POST /plan/generate returned an unexpected response' };
      }
      return { ok: true, data: data };
    } catch (err) {
      return { ok: false, status: 0, error: 'Backend unavailable for POST /plan/generate (' + err.message + ')' };
    }
  }

  async function approvePlan(payload) {
    try {
      const response = await request('/plan/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ schedule_id: payload && payload.schedule_id })
      });
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: await parseError(response, 'POST /plan/approve failed (HTTP ' + response.status + ')')
        };
      }
      const data = await response.json();
      if (!data || !data.schedule_id) {
        return { ok: false, status: response.status, error: 'POST /plan/approve returned an unexpected response' };
      }
      return { ok: true, data: data };
    } catch (err) {
      return { ok: false, status: 0, error: 'Backend unavailable for POST /plan/approve (' + err.message + ')' };
    }
  }

  async function disruptTrack(payload) {
    try {
      const response = await request('/disrupt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          task_id: payload && payload.task_id,
          reason: payload && payload.reason
        })
      });
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: await parseError(response, 'POST /disrupt failed (HTTP ' + response.status + ')')
        };
      }
      const data = await response.json();
      if (!data || !data.schedule_id) {
        return { ok: false, status: response.status, error: 'POST /disrupt returned an unexpected response' };
      }
      return { ok: true, data: data };
    } catch (err) {
      return { ok: false, status: 0, error: 'Backend unavailable for POST /disrupt (' + err.message + ')' };
    }
  }

  async function getCurrentPlan() {
    try {
      const response = await request('/plan/current', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (response.status === 404) {
        return { ok: false, status: 404, error: 'No current plan' };
      }
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: await parseError(response, 'GET /plan/current failed (HTTP ' + response.status + ')')
        };
      }
      const data = await response.json();
      if (!data || !data.schedule_id) {
        return { ok: false, status: response.status, error: 'GET /plan/current returned an unexpected response' };
      }
      return { ok: true, data: data };
    } catch (err) {
      return { ok: false, status: 0, error: 'Backend unavailable for GET /plan/current (' + err.message + ')' };
    }
  }

  async function checkHealth() {
    try {
      const response = await request('/health', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) return { ok: false, status: response.status };
      const data = await response.json();
      return { ok: data && data.status === 'ok', data: data };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  }

  async function fetchJsonFile(path) {
    const response = await request(path, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) {
      throw new Error(path + ' returned HTTP ' + response.status);
    }
    return response.json();
  }

  async function fetchNetwork() {
    try {
      const [stations, corridors, trains, movements] = await Promise.all([
        fetchJsonFile('/data/stations.json'),
        fetchJsonFile('/data/corridors.json'),
        fetchJsonFile('/data/trains.json'),
        fetchJsonFile('/data/train_movements.json')
      ]);
      return {
        ok: true,
        data: { stations: stations, corridors: corridors, trains: trains, movements: movements }
      };
    } catch (err) {
      return { ok: false, error: 'Unable to load synthetic network data (' + err.message + ')' };
    }
  }

  return {
    API_BASE: API_BASE,
    fetchTasks: fetchTasks,
    generatePlan: generatePlan,
    approvePlan: approvePlan,
    disruptTrack: disruptTrack,
    getCurrentPlan: getCurrentPlan,
    checkHealth: checkHealth,
    fetchNetwork: fetchNetwork
  };
})();
