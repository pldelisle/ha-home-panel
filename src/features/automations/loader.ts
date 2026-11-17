// TracesLoader: what the Automations pane reads from Home Assistant's records: the stored runs, each automation's config and the
// traces of the runs the flow cards draw. Pattern: Lit reactive controller (Lit docs, Reactive Controllers) over the API client
// (spec 12), the timing rules of the legacy `auLoad()`: the list at most every twenty seconds unless forced, the configs every ten
// minutes, a finished run's trace once; a change of the automations' states asks again 1.5 s later.
// Must not: word anything, read an entity itself (the pane hands it the automations and the selection), or load while paused.
import {ContextConsumer} from '@lit/context';
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import {StaleReply, type PanelApi} from '../../core/api.ts';
import type {Automation} from '../../providers/automations.ts';
import {apiContext} from '../../ui/contexts.ts';
import {pickedRuns, type Selection, type TracesData} from './traces.ts';

const LIST_MS = 20_000;
const CONFIGS_MS = 600_000;
const AFTER_CHANGE_MS = 1_500;

/** The pane's side: its automations now and what the person picked. */
export interface TracesSource {
  automations(): Automation[];
  selection(): Selection | null;
}

export class TracesLoader implements ReactiveController {
  readonly data: TracesData = {list: null, error: null, configs: {}, traces: {}};
  private api: PanelApi | undefined;
  private busy = false;
  private paused = true;
  private at = 0;
  private configsAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly source: TracesSource,
  ) {
    host.addController(this);
    new ContextConsumer(host, {context: apiContext, subscribe: false, callback: api => (this.api = api)});
  }

  hostDisconnected(): void {
    clearTimeout(this.timer);
  }

  /** The pane is off screen: no load starts, and a pending one after a change is dropped. */
  pause(): void {
    this.paused = true;
    clearTimeout(this.timer);
  }

  resume(): void {
    this.paused = false;
  }

  /** The automations' states changed: their runs are asked for again in a moment, once the change has settled. */
  changed(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(true), AFTER_CHANGE_MS);
  }

  /** Reads the runs, at most every twenty seconds unless `force`; the host updates when they arrived. */
  async load(force: boolean): Promise<void> {
    const api = this.api;
    if (this.busy || this.paused || !api) return;
    if (!force && Date.now() - this.at < LIST_MS) return;
    this.busy = true;
    const data = this.data;
    try {
      let dropped = false;
      const list = await api.traceList('automation').catch((e: unknown) => {
        // the config changed while the list was on its way: neither a list nor an error, so ask again later
        if (e instanceof StaleReply) dropped = true;
        else {
          const {message, code} = (e ?? {}) as {message?: string; code?: string};
          data.error = message || code || String(e);
        }
        return null;
      });
      if (dropped) return;
      if (list) {
        data.list = list;
        data.error = null;
      }
      const automations = this.source.automations();
      const stale = Date.now() - this.configsAt > CONFIGS_MS;
      if (stale) this.configsAt = Date.now();
      await Promise.all(
        automations
          .filter(a => a.item && (stale || !(a.item in data.configs)))
          .map(({item, entity}) =>
            api.automationConfig(entity).then(
              r => {
                data.configs[item as string] = r.config;
              },
              (e: unknown) => {
                if (e instanceof StaleReply) return; // not a failure: the next load asks again
                if (!((item as string) in data.configs)) data.configs[item as string] = null;
              },
            ),
          ),
      );
      const traces: Promise<void>[] = [];
      for (const run of pickedRuns(data, this.source.selection())) {
        if (!run) continue;
        const key = `${run.item_id}/${run.run_id}`;
        const have = data.traces[key];
        // a finished run's trace does not change
        if (have && have.state !== 'running' && run.state !== 'running') continue;
        traces.push(
          api.traceGet('automation', run.item_id, run.run_id).then(
            trace => {
              data.traces[key] = trace;
            },
            () => undefined,
          ),
        );
      }
      await Promise.all(traces);
      this.at = Date.now();
    } finally {
      this.busy = false;
    }
    this.host.requestUpdate();
  }
}
