import { monitoringFeatureFlags } from "@/config/monitoringFeatureFlags";

type Closable = { close: () => void };
type RemovableChart = { remove: () => void };

type RuntimeState = {
  started: boolean;
  paused: boolean;
  lastRuntimeStopClean: boolean;
  activeTab: string | null;
  loadedTabs: Set<string>;
  frozenTabs: Set<string>;
  strategyTesterMounted: boolean;
  tradeExecutionMounted: boolean;
  allStrategiesMounted: boolean;
  fetchControllers: Set<AbortController>;
  intervals: Set<number>;
  timeouts: Set<number>;
  animationFrames: Set<number>;
  resizeObservers: Set<ResizeObserver>;
  charts: Set<RemovableChart>;
  subscriptions: Set<() => void>;
  workers: Set<Worker>;
  connections: Set<Closable>;
};

const state: RuntimeState = {
  started: false,
  paused: false,
  lastRuntimeStopClean: true,
  activeTab: null,
  loadedTabs: new Set(),
  frozenTabs: new Set(),
  strategyTesterMounted: false,
  tradeExecutionMounted: false,
  allStrategiesMounted: false,
  fetchControllers: new Set(),
  intervals: new Set(),
  timeouts: new Set(),
  animationFrames: new Set(),
  resizeObservers: new Set(),
  charts: new Set(),
  subscriptions: new Set(),
  workers: new Set(),
  connections: new Set(),
};

const safeRun = (fn: () => void) => {
  try {
    fn();
  } catch {
    state.lastRuntimeStopClean = false;
  }
};

export function startMonitoringRuntime() {
  state.started = true;
  state.paused = false;
}

export function start() {
  startMonitoringRuntime();
}

export function pauseMonitoringRuntime() {
  state.paused = true;
}

export function pause() {
  pauseMonitoringRuntime();
}

export function resumeMonitoringRuntime() {
  state.paused = false;
  state.started = true;
}

export function resume() {
  resumeMonitoringRuntime();
}

export function stopMonitoringRuntime() {
  state.lastRuntimeStopClean = true;

  for (const id of state.intervals) safeRun(() => window.clearInterval(id));
  for (const id of state.timeouts) safeRun(() => window.clearTimeout(id));
  for (const id of state.animationFrames) safeRun(() => window.cancelAnimationFrame(id));
  for (const ctrl of state.fetchControllers) safeRun(() => ctrl.abort());
  for (const observer of state.resizeObservers) safeRun(() => observer.disconnect());
  for (const unsubscribe of state.subscriptions) safeRun(() => unsubscribe());
  for (const chart of state.charts) safeRun(() => chart.remove());
  for (const worker of state.workers) safeRun(() => worker.terminate());
  for (const connection of state.connections) safeRun(() => connection.close());

  state.intervals.clear();
  state.timeouts.clear();
  state.animationFrames.clear();
  state.fetchControllers.clear();
  state.resizeObservers.clear();
  state.subscriptions.clear();
  state.charts.clear();
  state.workers.clear();
  state.connections.clear();
  state.started = false;
  state.paused = false;
  state.activeTab = null;
  state.loadedTabs.clear();
  state.frozenTabs.clear();
  state.strategyTesterMounted = false;
  state.tradeExecutionMounted = false;
  state.allStrategiesMounted = false;
}

export function stop() {
  stopMonitoringRuntime();
}

export function disposeMonitoringRuntime() {
  stopMonitoringRuntime();
}

export function disposeAll() {
  disposeMonitoringRuntime();
}

export function freezeInactiveTabs(activeTab: string) {
  const active = String(activeTab || "").trim();
  state.activeTab = active || null;
  state.frozenTabs.clear();
  for (const tab of state.loadedTabs) {
    if (tab !== active) state.frozenTabs.add(tab);
  }
}

export function markTabLoaded(tabId: string) {
  const tab = String(tabId || "").trim();
  if (!tab) return;
  state.loadedTabs.add(tab);
  if (state.activeTab && tab !== state.activeTab) {
    state.frozenTabs.add(tab);
  } else {
    state.frozenTabs.delete(tab);
  }
}

export function setStrategyTesterMounted(value: boolean) {
  state.strategyTesterMounted = value;
}

export function setTradeExecutionMounted(value: boolean) {
  state.tradeExecutionMounted = value;
}

export function setAllStrategiesMounted(value: boolean) {
  state.allStrategiesMounted = value;
}

export function registerMonitoringFetch(controller: AbortController) {
  state.fetchControllers.add(controller);
  return () => state.fetchControllers.delete(controller);
}

export function registerMonitoringInterval(id: number) {
  state.intervals.add(id);
  return () => state.intervals.delete(id);
}

export function registerMonitoringTimeout(id: number) {
  state.timeouts.add(id);
  return () => state.timeouts.delete(id);
}

export function registerMonitoringAnimationFrame(id: number) {
  state.animationFrames.add(id);
  return () => state.animationFrames.delete(id);
}

export function registerMonitoringResizeObserver(observer: ResizeObserver) {
  state.resizeObservers.add(observer);
  return () => state.resizeObservers.delete(observer);
}

export function registerMonitoringChart(chart: RemovableChart) {
  state.charts.add(chart);
  return () => state.charts.delete(chart);
}

export function registerMonitoringSubscription(unsubscribe: () => void) {
  state.subscriptions.add(unsubscribe);
  return () => state.subscriptions.delete(unsubscribe);
}

export function registerMonitoringWorker(worker: Worker) {
  state.workers.add(worker);
  return () => state.workers.delete(worker);
}

export function registerMonitoringConnection(connection: Closable) {
  state.connections.add(connection);
  return () => state.connections.delete(connection);
}

export function getMonitoringRuntimeReport(gridBarsPerChart = 120) {
  return {
    activeTab: state.activeTab,
    mountedCharts: state.charts.size,
    loadedTabs: Array.from(state.loadedTabs),
    frozenTabs: Array.from(state.frozenTabs),
    activeCharts: state.charts.size,
    activeIntervals: state.intervals.size,
    activeTimeouts: state.timeouts.size,
    activeAnimationFrames: state.animationFrames.size,
    activeResizeObservers: state.resizeObservers.size,
    activeWorkers: state.workers.size,
    activeSubscriptions: state.subscriptions.size,
    strategyTesterMounted: state.strategyTesterMounted,
    tradeExecutionMounted: state.tradeExecutionMounted,
    allStrategiesMounted: state.allStrategiesMounted,
    preloadInactiveTabs: monitoringFeatureFlags.enablePreloadInactiveTabs,
    featureFlags: monitoringFeatureFlags,
    gridBarsPerChart,
    fullHistoryLoadedInGrid: false,
    backtestRunsInReact: monitoringFeatureFlags.enableBacktestInReact,
    strategyRunsInReact: false,
    realtimePolling: monitoringFeatureFlags.enableRealtimePolling,
    maxBarsPerGridChart: gridBarsPerChart,
    lastRuntimeStopClean: state.lastRuntimeStopClean,
  };
}
