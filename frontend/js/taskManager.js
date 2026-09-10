/* RailSync AI - Task State & Priority Management */

window.RailSyncTasks = (function () {
  'use strict';

  // Internal Task State
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

  /**
   * Load tasks from RailSyncAPI
   */
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

  /**
   * Normalize task object structure
   */
  function normalizeTask(raw, index) {
    const id = raw.id || raw.task_id || `TSK-${1001 + index}`;
    const department = raw.department || raw.source || raw.dept || 'P-Way';
    const corridor = raw.corridor || raw.section || raw.location || 'AGC-MTJ';
    const description = raw.description || raw.title || raw.work_type || 'Track geometry inspection and ballast tamping';
    const severity = (raw.severity || 'Medium').toLowerCase();
    
    // Normalize Severity capitalization
    const severityFormatted = severity.charAt(0).toUpperCase() + severity.slice(1);
    
    const duration = parseFloat(raw.duration || raw.estimated_duration || 2.5);
    const maintenanceAge = parseInt(raw.maintenance_age || raw.time_since_maintenance || 90, 10);
    
    // Calculate or normalize Priority Score (1 - 100)
    let priorityScore = raw.priority_score || raw.priority;
    if (priorityScore === undefined || priorityScore === null) {
      priorityScore = calculatePriorityScore(severityFormatted, maintenanceAge, corridor);
    } else {
      priorityScore = Math.min(100, Math.max(1, parseInt(priorityScore, 10)));
    }

    const status = raw.status || 'Unassigned';

    return {
      id: id,
      department: department,
      corridor: corridor,
      description: description,
      severity: severityFormatted,
      duration: duration,
      maintenanceAge: maintenanceAge,
      priorityScore: priorityScore,
      status: status,
      raw: raw
    };
  }

  /**
   * Calculate Priority Score strictly based on the 3 backend factors:
   * 1. Severity
   * 2. Time since maintenance (maintenance age)
   * 3. Corridor traffic density
   */
  function calculatePriorityScore(severity, ageDays, corridor) {
    let severityWeight = 30; // default medium
    if (severity === 'Critical') severityWeight = 50;
    else if (severity === 'High') severityWeight = 40;
    else if (severity === 'Medium') severityWeight = 25;
    else if (severity === 'Low') severityWeight = 15;

    // Age factor (capped at 30 points for > 120 days)
    let ageWeight = Math.min(30, Math.round((ageDays / 120) * 30));

    // Corridor traffic weight (AGC-NDLS is high-density main trunk)
    let trafficWeight = 15;
    if (corridor.includes('AGC') || corridor.includes('NDLS') || corridor.includes('MTJ')) {
      trafficWeight = 20; // High traffic density
    }

    return Math.min(99, severityWeight + ageWeight + trafficWeight);
  }

  /**
   * Generate concise priority explanation based ONLY on backend factors
   */
  function getPriorityExplanation(task) {
    if (!task) return null;

    const { severity, maintenanceAge, corridor, priorityScore } = task;

    let priorityLevel = 'Low';
    let levelBadge = 'badge-neutral';
    if (priorityScore >= 75) {
      priorityLevel = 'High';
      levelBadge = 'badge-danger';
    } else if (priorityScore >= 45) {
      priorityLevel = 'Medium';
      levelBadge = 'badge-warning';
    } else {
      priorityLevel = 'Low';
      levelBadge = 'badge-info';
    }

    // Traffic influence description
    const isMainCorridor = corridor.includes('AGC') || corridor.includes('NDLS') || corridor.includes('MTJ');
    const trafficInfluence = isMainCorridor 
      ? 'High Traffic Trunk Line (Agra Cantt — New Delhi Corridor)' 
      : 'Standard Density Feeder Line';

    return {
      score: priorityScore,
      level: priorityLevel,
      levelBadge: levelBadge,
      severityFactor: `${severity} Severity Rating`,
      ageFactor: `${maintenanceAge} days elapsed since last maintenance block`,
      trafficFactor: trafficInfluence,
      summary: `Priority rating of ${priorityScore}/100 (${priorityLevel}) is derived from ${severity} severity, ${maintenanceAge} days maintenance age, and ${isMainCorridor ? 'high corridor traffic density' : 'standard line density'}.`
    };
  }

  /**
   * Filter and sort tasks
   */
  function getFilteredTasks() {
    let result = [...state.tasks];
    const { search, department, corridor, severity, status, priority } = state.filters;

    // Search text
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(t => 
        t.id.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.corridor.toLowerCase().includes(q) ||
        t.department.toLowerCase().includes(q)
      );
    }

    // Department
    if (department) {
      result = result.filter(t => t.department.toLowerCase() === department.toLowerCase());
    }

    // Corridor
    if (corridor) {
      result = result.filter(t => t.corridor.toLowerCase() === corridor.toLowerCase());
    }

    // Severity
    if (severity) {
      result = result.filter(t => t.severity.toLowerCase() === severity.toLowerCase());
    }

    // Status
    if (status) {
      result = result.filter(t => t.status.toLowerCase() === status.toLowerCase());
    }

    // Priority filter
    if (priority) {
      if (priority === 'high') result = result.filter(t => t.priorityScore >= 75);
      else if (priority === 'medium') result = result.filter(t => t.priorityScore >= 40 && t.priorityScore < 75);
      else if (priority === 'low') result = result.filter(t => t.priorityScore < 40);
    }

    // Sorting
    const { field, direction } = state.sort;
    const mult = direction === 'asc' ? 1 : -1;

    result.sort((a, b) => {
      if (field === 'priority_score') return (a.priorityScore - b.priorityScore) * mult;
      if (field === 'severity') {
        const sevMap = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
        return ((sevMap[a.severity] || 0) - (sevMap[b.severity] || 0)) * mult;
      }
      if (field === 'maintenance_age') return (a.maintenanceAge - b.maintenanceAge) * mult;
      if (field === 'duration') return (a.duration - b.duration) * mult;
      if (field === 'id') return a.id.localeCompare(b.id) * mult;
      return 0;
    });

    return result;
  }

  function setFilter(key, value) {
    if (state.filters.hasOwnProperty(key)) {
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
    return state.tasks.find(t => t.id === state.selectedTaskId) || null;
  }

  // Listeners for UI state updates
  const listeners = [];
  function onChange(fn) {
    listeners.push(fn);
  }

  function notifyStateChange() {
    listeners.forEach(fn => fn(getState()));
  }

  function getState() {
    return {
      tasks: state.tasks,
      filteredTasks: getFilteredTasks(),
      loading: state.loading,
      error: state.error,
      selectedTask: getSelectedTask(),
      filters: { ...state.filters },
      sort: { ...state.sort }
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
