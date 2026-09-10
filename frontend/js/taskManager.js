/* RailSync AI - Task State & Priority Management */

window.RailSyncTasks = (function () {
  'use strict';

  const PLANNING_DATE = '2026-09-09';
  const SEVERITY_LABELS = { 1: 'Low', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Critical' };

  const state = {
    tasks: [],
    loading: false,
    error: null,
    selectedTaskId: null,
    filters: {
      search: '',
      department: '',
      corridor: '',
      severity: '',
      status: '',
      priority: ''
    },
    sort: {
      field: 'priority_score',
      direction: 'desc'
    }
  };

  async function loadTasks() {
    state.loading = true;
    state.error = null;
    notifyStateChange();

    const result = await RailSyncAPI.fetchTasks();

    state.loading = false;
    if (result.ok) {
      state.tasks = (result.data || []).map(normalizeTask);
      state.error = null;
    } else {
      state.tasks = [];
      state.error = result.error;
    }

    notifyStateChange();
    return result;
  }

  function daysBetween(isoDate, planningDate) {
    const start = new Date(isoDate + 'T00:00:00Z');
    const end = new Date(planningDate + 'T00:00:00Z');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    return Math.max(0, Math.round((end - start) / 86400000));
  }

  function normalizeTask(raw, index) {
    const id = raw.task_id || raw.id || ('TASK-' + String(index + 1).padStart(3, '0'));
    const corridor = raw.corridor_id || raw.corridor || '';
    const severityNum = parseInt(raw.severity, 10);
    const severityLabel = SEVERITY_LABELS[severityNum] || String(raw.severity || '');
    const durationMin = parseInt(raw.estimated_duration_min, 10);
    const lastDate = raw.last_maintenance_date || '';
    const maintenanceAge = lastDate ? daysBetween(lastDate, PLANNING_DATE) : 0;
    const priorityScore = raw.priority_score === undefined || raw.priority_score === null
      ? null
      : Math.min(100, Math.max(0, Number(raw.priority_score)));

    return {
      id: id,
      department: raw.department || '',
      corridor: corridor,
      description: raw.description || '',
      severity: severityLabel,
      severityValue: severityNum,
      durationMin: isNaN(durationMin) ? 0 : durationMin,
      duration: isNaN(durationMin) ? 0 : Math.round((durationMin / 60) * 10) / 10,
      lastMaintenanceDate: lastDate,
      maintenanceAge: maintenanceAge,
      priorityScore: priorityScore === null ? 0 : Math.round(priorityScore * 100) / 100,
      status: raw.status || 'pending',
      raw: raw
    };
  }

  function getPriorityExplanation(task) {
    if (!task) return null;

    const { severity, maintenanceAge, corridor, priorityScore } = task;
    let priorityLevel = 'Low';
    let levelBadge = 'badge-info';
    if (priorityScore >= 75) {
      priorityLevel = 'High';
      levelBadge = 'badge-danger';
    } else if (priorityScore >= 45) {
      priorityLevel = 'Medium';
      levelBadge = 'badge-warning';
    }

    const trafficLabels = {
      C1: 'High corridor traffic (C1)',
      C2: 'Elevated corridor traffic (C2)',
      C3: 'Moderate corridor traffic (C3)',
      C4: 'Lower corridor traffic (C4)'
    };

    return {
      score: priorityScore,
      level: priorityLevel,
      levelBadge: levelBadge,
      severityFactor: severity + ' severity (backend score input)',
      ageFactor: maintenanceAge + ' days since last maintenance (' + (task.lastMaintenanceDate || 'n/a') + ')',
      trafficFactor: trafficLabels[corridor] || ('Corridor ' + corridor),
      summary: 'Priority ' + priorityScore + '/100 from the backend rule-based score (severity, maintenance age, corridor traffic).'
    };
  }

  function getFilteredTasks() {
    let result = state.tasks.slice();
    const { search, department, corridor, severity, status, priority } = state.filters;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(function (t) {
        return t.id.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.corridor.toLowerCase().includes(q) ||
          t.department.toLowerCase().includes(q);
      });
    }

    if (department) {
      result = result.filter(function (t) { return t.department === department; });
    }
    if (corridor) {
      result = result.filter(function (t) { return t.corridor === corridor; });
    }
    if (severity) {
      result = result.filter(function (t) { return t.severity.toLowerCase() === severity.toLowerCase(); });
    }
    if (status) {
      result = result.filter(function (t) { return t.status.toLowerCase() === status.toLowerCase(); });
    }
    if (priority) {
      if (priority === 'high') result = result.filter(function (t) { return t.priorityScore >= 75; });
      else if (priority === 'medium') result = result.filter(function (t) { return t.priorityScore >= 40 && t.priorityScore < 75; });
      else if (priority === 'low') result = result.filter(function (t) { return t.priorityScore < 40; });
    }

    const field = state.sort.field;
    const mult = state.sort.direction === 'asc' ? 1 : -1;
    result.sort(function (a, b) {
      if (field === 'priority_score') return (a.priorityScore - b.priorityScore) * mult;
      if (field === 'severity') return ((a.severityValue || 0) - (b.severityValue || 0)) * mult;
      if (field === 'maintenance_age') return (a.maintenanceAge - b.maintenanceAge) * mult;
      if (field === 'duration') return (a.durationMin - b.durationMin) * mult;
      if (field === 'id') return a.id.localeCompare(b.id) * mult;
      return 0;
    });

    return result;
  }

  function setFilter(key, value) {
    if (Object.prototype.hasOwnProperty.call(state.filters, key)) {
      state.filters[key] = value;
      notifyStateChange();
    }
  }

  function setSort(field) {
    if (state.sort.field === field) {
      state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort.field = field;
      state.sort.direction = 'desc';
    }
    notifyStateChange();
  }

  function selectTask(taskId) {
    state.selectedTaskId = taskId;
    notifyStateChange();
  }

  function getSelectedTask() {
    return state.tasks.find(function (t) { return t.id === state.selectedTaskId; }) || null;
  }

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function notifyStateChange() {
    listeners.forEach(function (fn) { fn(getState()); });
  }

  function getState() {
    return {
      tasks: state.tasks,
      filteredTasks: getFilteredTasks(),
      loading: state.loading,
      error: state.error,
      selectedTask: getSelectedTask(),
      filters: Object.assign({}, state.filters),
      sort: Object.assign({}, state.sort)
    };
  }

  return {
    loadTasks: loadTasks,
    setFilter: setFilter,
    setSort: setSort,
    selectTask: selectTask,
    getSelectedTask: getSelectedTask,
    getPriorityExplanation: getPriorityExplanation,
    onChange: onChange,
    getState: getState
  };
})();
