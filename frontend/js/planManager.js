/* RailSync AI - Block Planning against the real FastAPI optimizer */

window.RailSyncPlan = (function () {
  'use strict';

  const GANTT_START_HOUR = 1;
  const GANTT_END_HOUR = 8;

  const state = {
    generating: false,
    disrupting: false,
    stageText: '',
    stagePercent: 0,
    currentPlan: null,
    previousPlan: null,
    selectedTaskIds: [],
    trainMovements: [],
    error: null
  };

  function isoToUtcHour(iso) {
    const parsed = new Date(iso);
    if (isNaN(parsed.getTime())) return 0;
    return parsed.getUTCHours() + parsed.getUTCMinutes() / 60 + parsed.getUTCSeconds() / 3600;
  }

  function formatHour(h) {
    const hours = Math.floor(h);
    const mins = Math.round((h - hours) * 60);
    return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
  }

  function delay(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }

  function lookupTask(taskId) {
    const tasks = RailSyncTasks.getState().tasks || [];
    return tasks.find(function (t) { return t.id === taskId; }) || null;
  }

  function mapBackendPlan(raw, extras) {
    extras = extras || {};
    const blocks = (raw.schedule || []).map(function (block, index) {
      const startHour = isoToUtcHour(block.block_start);
      const endHour = isoToUtcHour(block.block_end);
      const durationMin = Math.max(0, Math.round((endHour - startHour) * 60));
      const task = lookupTask(block.task_id);
      return {
        blockId: (raw.schedule_id || 'BLK') + '-' + (index + 1),
        taskId: block.task_id,
        corridor: block.corridor_id,
        department: task ? task.department : '',
        description: task ? task.description : '',
        severity: task ? task.severity : '',
        priorityScore: task ? task.priorityScore : 0,
        durationMin: durationMin,
        duration: Math.round((durationMin / 60) * 10) / 10,
        startHour: startHour,
        endHour: endHour,
        startTimeFormatted: formatHour(startHour),
        endTimeFormatted: formatHour(endHour),
        blockStart: block.block_start,
        blockEnd: block.block_end,
        status: extras.lifecycleStatus || raw.lifecycle_status || 'active'
      };
    });

    const unscheduledIds = raw.unscheduled_task_ids || [];
    const unscheduledTasks = unscheduledIds.map(function (taskId) {
      const task = lookupTask(taskId);
      return {
        task: task || { id: taskId, corridor: '', description: 'Unknown task' },
        reason: 'Not placed in a train-free window (duration or corridor capacity).'
      };
    });

    const totalMin = blocks.reduce(function (sum, b) { return sum + b.durationMin; }, 0);

    return {
      scheduleId: raw.schedule_id,
      createdAt: extras.createdAt || new Date().toISOString(),
      solverStatus: raw.status || 'feasible',
      lifecycleState: raw.lifecycle_status || extras.lifecycleStatus || 'active',
      scheduledCount: blocks.length,
      unscheduledCount: unscheduledIds.length,
      totalBlockHours: (Math.round((totalMin / 60) * 10) / 10).toFixed(1),
      totalBlockMinutes: totalMin,
      blocks: blocks,
      unscheduledTasks: unscheduledTasks,
      unscheduledTaskIds: unscheduledIds,
      summary: extras.summary || (
        'Scheduled ' + blocks.length + ' maintenance blocks (' + totalMin + ' min) with ' +
        unscheduledIds.length + ' unscheduled. Solver ' + (raw.status || 'feasible') +
        ', lifecycle ' + (raw.lifecycle_status || 'active') + '.'
      ),
      raw: raw
    };
  }

  function setSelectedTaskIds(taskIds) {
    state.selectedTaskIds = taskIds;
    notifyStateChange();
  }

  function toggleTaskSelection(taskId) {
    const idx = state.selectedTaskIds.indexOf(taskId);
    if (idx >= 0) state.selectedTaskIds.splice(idx, 1);
    else state.selectedTaskIds.push(taskId);
    notifyStateChange();
  }

  async function loadTrainMovements() {
    const result = await RailSyncAPI.fetchNetwork();
    if (result.ok) {
      state.trainMovements = (result.data.movements || []).map(function (m) {
        const startHour = isoToUtcHour(m.start);
        const endHour = isoToUtcHour(m.end);
        return {
          id: m.movement_id,
          name: m.train_id,
          corridor: m.corridor_id,
          startHour: startHour,
          endHour: endHour,
          start: m.start,
          end: m.end,
          type: 'train'
        };
      });
      notifyStateChange();
    }
    return result;
  }

  async function refreshCurrentPlan() {
    const result = await RailSyncAPI.getCurrentPlan();
    if (result.ok) {
      state.currentPlan = mapBackendPlan(result.data);
      state.error = null;
      notifyStateChange();
      return result;
    }
    if (result.status === 404) {
      state.currentPlan = null;
      notifyStateChange();
      return result;
    }
    state.error = result.error;
    notifyStateChange();
    return result;
  }

  async function generateBlockPlan() {
    state.generating = true;
    state.error = null;
    state.stagePercent = 15;
    state.stageText = 'Waiting for FastAPI /plan/generate (CP-SAT)...';
    notifyStateChange();
    await delay(150);

    const apiResult = await RailSyncAPI.generatePlan();
    state.stagePercent = 80;
    state.stageText = 'Receiving optimizer result...';
    notifyStateChange();
    await delay(100);

    state.generating = false;
    if (!apiResult.ok) {
      state.stagePercent = 0;
      state.stageText = '';
      state.error = apiResult.error;
      notifyStateChange();
      return { ok: false, error: apiResult.error };
    }

    if (state.currentPlan) {
      state.previousPlan = Object.assign({}, state.currentPlan, { lifecycleState: 'superseded' });
    }
    state.currentPlan = mapBackendPlan(apiResult.data);
    state.stagePercent = 100;
    state.stageText = 'Block schedule received from CP-SAT.';
    const current = await RailSyncAPI.getCurrentPlan();
    if (current.ok) state.currentPlan = mapBackendPlan(current.data);
    await RailSyncTasks.loadTasks();
    notifyStateChange();
    return { ok: true, plan: state.currentPlan };
  }

  async function approveCurrentPlan() {
    if (!state.currentPlan) return { ok: false, error: 'No active plan' };
    const scheduleId = state.currentPlan.scheduleId;
    const apiResult = await RailSyncAPI.approvePlan({ schedule_id: scheduleId });
    if (!apiResult.ok) {
      state.error = apiResult.error;
      notifyStateChange();
      return { ok: false, error: apiResult.error };
    }
    const current = await RailSyncAPI.getCurrentPlan();
    if (current.ok) {
      state.currentPlan = mapBackendPlan(current.data);
    } else {
      state.currentPlan.lifecycleState = apiResult.data.lifecycle_status || 'approved';
    }
    state.error = null;
    await RailSyncTasks.loadTasks();
    notifyStateChange();
    return { ok: true, scheduleId: scheduleId, data: apiResult.data };
  }

  async function disruptCurrentPlan(taskId, reason) {
    if (!taskId) return { ok: false, error: 'Select a scheduled task to disrupt' };
    state.disrupting = true;
    state.error = null;
    notifyStateChange();

    const previousId = state.currentPlan ? state.currentPlan.scheduleId : null;
    const apiResult = await RailSyncAPI.disruptTrack({
      task_id: taskId,
      reason: reason || 'Block overrun'
    });

    if (!apiResult.ok) {
      state.disrupting = false;
      state.error = apiResult.error;
      notifyStateChange();
      return { ok: false, error: apiResult.error };
    }

    if (state.currentPlan) {
      state.previousPlan = Object.assign({}, state.currentPlan, {
        lifecycleState: 'superseded',
        scheduleId: previousId
      });
    }

    const current = await RailSyncAPI.getCurrentPlan();
    if (current.ok) {
      state.currentPlan = mapBackendPlan(current.data);
    } else {
      state.currentPlan = {
        scheduleId: apiResult.data.schedule_id,
        lifecycleState: apiResult.data.lifecycle_status || 'active',
        solverStatus: 'feasible',
        scheduledCount: 0,
        unscheduledCount: 0,
        totalBlockHours: '0.0',
        totalBlockMinutes: 0,
        blocks: [],
        unscheduledTasks: [],
        summary: apiResult.data.message || 'Plan re-optimized after disruption'
      };
    }

    state.disrupting = false;
    state.error = null;
    await RailSyncTasks.loadTasks();
    notifyStateChange();
    return { ok: true, data: apiResult.data, previousScheduleId: previousId };
  }

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function notifyStateChange() {
    listeners.forEach(function (fn) { fn(getState()); });
  }

  function getState() {
    return {
      generating: state.generating,
      disrupting: state.disrupting,
      stageText: state.stageText,
      stagePercent: state.stagePercent,
      currentPlan: state.currentPlan,
      previousPlan: state.previousPlan,
      selectedTaskIds: state.selectedTaskIds,
      trainTimetable: state.trainMovements,
      ganttStartHour: GANTT_START_HOUR,
      ganttEndHour: GANTT_END_HOUR,
      error: state.error
    };
  }

  return {
    generateBlockPlan: generateBlockPlan,
    approveCurrentPlan: approveCurrentPlan,
    disruptCurrentPlan: disruptCurrentPlan,
    refreshCurrentPlan: refreshCurrentPlan,
    loadTrainMovements: loadTrainMovements,
    setSelectedTaskIds: setSelectedTaskIds,
    toggleTaskSelection: toggleTaskSelection,
    onChange: onChange,
    getState: getState
  };
})();
