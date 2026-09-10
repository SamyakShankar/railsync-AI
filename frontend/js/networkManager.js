/* RailSync AI - Synthetic network from project data files */

window.RailSyncNetwork = (function () {
  'use strict';

  const CORRIDOR_LABELS = {
    C1: 'C1: S1 → S2 → S3',
    C2: 'C2: S2 → S4',
    C3: 'C3: S2 → S5',
    C4: 'C4: S4 → S6'
  };

  const state = {
    stations: [],
    corridors: [],
    trains: [],
    movements: [],
    loading: false,
    error: null,
    selectedTrainId: null,
    selectedCorridorId: null,
    selectedStationCode: null
  };

  async function loadNetwork() {
    state.loading = true;
    state.error = null;
    notifyStateChange();

    const result = await RailSyncAPI.fetchNetwork();
    state.loading = false;
    if (!result.ok) {
      state.stations = [];
      state.corridors = [];
      state.trains = [];
      state.movements = [];
      state.error = result.error;
      notifyStateChange();
      return result;
    }

    const data = result.data;
    state.stations = (data.stations || []).map(function (s) {
      return {
        code: s.station_id,
        name: s.name,
        km: 0,
        platformCount: 0,
        status: 'Synthetic node',
        division: 'RailSync demo'
      };
    });
    state.corridors = (data.corridors || []).map(function (c) {
      return {
        id: c.corridor_id,
        name: CORRIDOR_LABELS[c.corridor_id] || c.corridor_id,
        stationIds: c.station_ids || [],
        startStation: (c.station_ids || [])[0],
        endStation: (c.station_ids || [])[(c.station_ids || []).length - 1],
        capacity: c.capacity,
        status: 'Operational',
        tracks: 'Capacity ' + c.capacity
      };
    });
    state.trains = (data.trains || []).map(function (t, idx) {
      const route = t.route || [];
      const section = inferCorridor(route, state.corridors);
      return {
        id: t.train_id,
        number: t.train_id,
        name: t.train_id,
        type: 'Synthetic service',
        direction: route[0] + ' → ' + route[route.length - 1],
        section: section,
        positionPct: 20 + (idx * 10) % 60,
        speed: 'n/a',
        status: 'Timetable (synthetic)',
        delayMins: 0,
        timetable: route.join(' → ')
      };
    });
    state.movements = data.movements || [];
    notifyStateChange();
    return result;
  }

  function inferCorridor(route, corridors) {
    for (let i = 0; i < corridors.length; i += 1) {
      const ids = corridors[i].stationIds || [];
      if (ids.length && route.indexOf(ids[0]) >= 0 && route.indexOf(ids[ids.length - 1]) >= 0) {
        return corridors[i].id;
      }
    }
    return corridors[0] ? corridors[0].id : '';
  }

  function selectTrain(trainId) {
    state.selectedTrainId = trainId;
    state.selectedCorridorId = null;
    state.selectedStationCode = null;
    notifyStateChange();
  }

  function selectCorridor(corridorId) {
    state.selectedCorridorId = corridorId;
    state.selectedTrainId = null;
    state.selectedStationCode = null;
    notifyStateChange();
  }

  function selectStation(stationCode) {
    state.selectedStationCode = stationCode;
    state.selectedTrainId = null;
    state.selectedCorridorId = null;
    notifyStateChange();
  }

  function getSelectedTrain() {
    return state.trains.find(function (t) { return t.id === state.selectedTrainId; }) || null;
  }

  function getSelectedCorridor() {
    return state.corridors.find(function (c) { return c.id === state.selectedCorridorId; }) || null;
  }

  function getSelectedStation() {
    return state.stations.find(function (s) { return s.code === state.selectedStationCode; }) || null;
  }

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function notifyStateChange() {
    listeners.forEach(function (fn) { fn(getState()); });
  }

  function getState() {
    return {
      stations: state.stations,
      corridors: state.corridors,
      trains: state.trains,
      movements: state.movements,
      loading: state.loading,
      error: state.error,
      selectedTrain: getSelectedTrain(),
      selectedCorridor: getSelectedCorridor(),
      selectedStation: getSelectedStation()
    };
  }

  return {
    loadNetwork: loadNetwork,
    selectTrain: selectTrain,
    selectCorridor: selectCorridor,
    selectStation: selectStation,
    onChange: onChange,
    getState: getState
  };
})();
