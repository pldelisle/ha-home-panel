// SystemDataController: one key of Home Assistant's frontend system data (one value for every screen of the house, written only by an admin),
// read when its host is shown or the config changes and written through: Lights' order and links today, the scenes' order next.
// Pattern: a Lit reactive controller over the API client (Lit, "Reactive controllers"), write-through as in Fowler's PoEAA caching notes:
// the value changes at once and is put back if Home Assistant refuses it. The value is the same under every config, so a reply is never stale.
// Must not: toast, word or draw anything (the caller says "Couldn't save"), keep a reply that arrives after its host left, or hold a value per config.
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import type {PanelApi} from '../../core/api.ts';
import type {PanelSystemData} from '../../core/ha.ts';
import type {PanelStore} from '../../core/store.ts';

/** What the controller needs of its host: Lit's, and whether the pane is shown (another screen may have rearranged while it was not). */
export type SystemDataHost = ReactiveControllerHost & {active: boolean};

/** What it asks of the panel, read at each use: there once the host connects. */
export interface SystemDataDeps {
  api: Pick<PanelApi, 'getSystemData' | 'setSystemData'>;
  store: Pick<PanelStore, 'generation'>;
}

export class SystemDataController implements ReactiveController {
  /** The key's value; null until the first reply, and when Home Assistant has none. */
  value: PanelSystemData | null = null;
  /** The generation of the config the value was read under, and whether the host was shown then: a change of either reads again. */
  private generation = -1;
  private shown = false;
  /** Each read takes a ticket; a reply whose ticket is not the latest, or that arrives after the host left, is dropped. */
  private ticket = 0;

  constructor(
    private readonly host: SystemDataHost,
    private readonly deps: () => SystemDataDeps | null,
    private readonly key: string,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this.read();
  }

  hostUpdate(): void {
    this.read();
  }

  hostDisconnected(): void {
    this.ticket++;
    this.shown = false;
  }

  /** Merges `patch` into the value, tells the host, and saves it; a refused save puts the old value back and rejects with Home Assistant's reason. */
  async set(patch: Partial<PanelSystemData>): Promise<void> {
    const deps = this.deps();
    if (!deps) return;
    const before = this.value;
    const next = {...before, ...patch};
    this.value = next;
    this.ticket++; // a read in flight is older than this write
    this.host.requestUpdate();
    try {
      await deps.api.setSystemData(this.key, next);
    } catch (error) {
      if (this.value === next) {
        this.value = before;
        this.host.requestUpdate();
      }
      throw error;
    }
  }

  /** Reads when the config changed, or when the host has just been shown. */
  private read(): void {
    const deps = this.deps();
    const shown = this.host.active;
    if (!deps || (deps.store.generation === this.generation && (!shown || this.shown))) {
      this.shown = shown;
      return;
    }
    this.generation = deps.store.generation;
    this.shown = shown;
    const ticket = ++this.ticket;
    deps.api.getSystemData(this.key, {stale: false}).then(
      value => {
        if (ticket !== this.ticket || JSON.stringify(value) === JSON.stringify(this.value)) return;
        this.value = value;
        this.host.requestUpdate();
      },
      () => {}, // nothing saved yet, or no connection: the tiles keep the order by area
    );
  }
}
