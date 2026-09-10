/* RailSync AI - API Service Layer */

window.RailSyncAPI = (function () {
  'use strict';

  const API_BASE = window.RAILSYNC_API_BASE || '';

  /**
   * Fetch all tasks from GET /tasks
   */
  async function fetchTasks() {
    try {
      const response = await fetch(`${API_BASE}/tasks`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `Server returned HTTP ${response.status}: ${response.statusText}`
        };
      }

      const data = await response.json();
      return {
        ok: true,
        data: Array.isArray(data) ? data : (data.tasks || [])
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: `Network error or GET /tasks unreachable (${err.message})`
      };
    }
  }

  /**
   * Generate block plan via POST /plan/generate
   */
  async function generatePlan(payload) {
    try {
      const response = await fetch(`${API_BASE}/plan/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload || {})
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `POST /plan/generate failed (HTTP ${response.status})`
        };
      }

      const data = await response.json();
      return { ok: true, data: data };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: `POST /plan/generate unreachable (${err.message})`
      };
    }
  }

  /**
   * Approve block plan via POST /plan/approve
   */
  async function approvePlan(payload) {
    try {
      const response = await fetch(`${API_BASE}/plan/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload || {})
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `POST /plan/approve failed (HTTP ${response.status})`
        };
      }

      const data = await response.json();
      return { ok: true, data: data };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: `POST /plan/approve unreachable (${err.message})`
      };
    }
  }

  /**
   * Trigger disruption / re-optimization via POST /disrupt
   */
  async function disruptTrack(payload) {
    try {
      const response = await fetch(`${API_BASE}/disrupt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload || {})
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `POST /disrupt failed (HTTP ${response.status})`
        };
      }

      const data = await response.json();
      return { ok: true, data: data };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: `POST /disrupt unreachable (${err.message})`
      };
    }
  }

  /**
   * Fetch current schedule via GET /plan/current
   */
  async function getCurrentPlan() {
    try {
      const response = await fetch(`${API_BASE}/plan/current`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `GET /plan/current returned HTTP ${response.status}`
        };
      }

      const data = await response.json();
      return { ok: true, data: data };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: `GET /plan/current unreachable (${err.message})`
      };
    }
  }

  /**
   * Fetch health status from GET /health
   */
  async function checkHealth() {
    try {
      const response = await fetch(`${API_BASE}/health`, { method: 'GET' });
      if (!response.ok) return { ok: false };
      const data = await response.json();
      return { ok: true, data: data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  return {
    fetchTasks: fetchTasks,
    generatePlan: generatePlan,
    approvePlan: approvePlan,
    disruptTrack: disruptTrack,
    getCurrentPlan: getCurrentPlan,
    checkHealth: checkHealth
  };
})();
