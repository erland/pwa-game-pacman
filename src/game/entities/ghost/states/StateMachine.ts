// src/game/entities/ghost/state/StateMachine.ts
export interface State<TCtx> {
  readonly id: string;
  enter?(ctx: TCtx): void;
  exit?(ctx: TCtx): void;
  update(ctx: TCtx, dtMs: number, updateArg: any): void;
}

export class StateMachine<TCtx, SId extends string> {
  private states: Record<SId, State<TCtx>>;
  private _current!: State<TCtx>;
  private _id!: SId;

  constructor(states: Record<SId, State<TCtx>>, initial: SId) {
    this.states = states;
    this.set(initial);
  }

  id(): SId { return this._id; }

  set(id: SId, ctx?: TCtx): void {
    if (this._current && this._current.exit && ctx) this._current.exit(ctx);
    this._id = id;
    this._current = this.states[id];
    if (this._current.enter && ctx) this._current.enter(ctx);
  }

  update(ctx: TCtx, dtMs: number, arg: any): void {
    this._current.update(ctx, dtMs, arg);
  }
}