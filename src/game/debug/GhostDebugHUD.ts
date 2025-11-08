// src/game/debug/GhostDebugHUD.ts
import Phaser from 'phaser';
import { Ghost } from '../entities/ghost/GhostBase';
import { GhostMode } from '../entities/ghost/GhostTypes';

type Options = {
  width?: number;       // panel width
  margin?: number;      // margin from screen edges
  lineHeight?: number;  // text line height
  header?: string;      // header label
};

export class GhostDebugHUD {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private headerText: Phaser.GameObjects.Text;
  private lines: Phaser.GameObjects.Text[] = [];

  private w: number;
  private margin: number;
  private lineH: number;
  private headerLabel: string;

  constructor(scene: Phaser.Scene, opts: Options = {}) {
    this.scene = scene;
    this.w = opts.width ?? 220;
    this.margin = opts.margin ?? 8;
    this.lineH = opts.lineHeight ?? 18;
    this.headerLabel = opts.header ?? 'Ghosts';

    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(50);
    this.bg = scene.add.rectangle(0, 0, this.w, this.lineH, 0x000000, 0.55).setOrigin(0, 0);
    this.headerText = scene.add
      .text(0, 0, this.headerLabel, { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' })
      .setOrigin(0, 0);

    this.container.add([this.bg, this.headerText]);

    this.layout(scene.scale.width, scene.scale.height);
  }

  layout(screenW: number, _screenH: number): void {
    // Top-right anchor
    const x = Math.max(0, screenW - this.w - this.margin);
    const y = this.margin;
    this.container.setPosition(x, y);
  }

  setVisible(v: boolean) { this.container.setVisible(v); }

  /** Ensure we have one line per ghost (create/destroy texts as needed). */
  private ensureLineCount(n: number) {
    // add lines
    while (this.lines.length < n) {
      const t = this.scene.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffff00',
      }).setOrigin(0, 0);
      this.container.add(t);
      this.lines.push(t);
    }
    // remove extra lines
    while (this.lines.length > n) {
      const t = this.lines.pop()!;
      t.destroy();
    }
  }

  private modeColor(m: GhostMode): string {
    switch (m) {
      case GhostMode.Chase: return '#ff5555';        // red-ish
      case GhostMode.Scatter: return '#55aaff';     // blue-ish
      case GhostMode.Frightened: return '#00ccff';  // cyan
      case GhostMode.LeavingHouse: return '#ffaa00';// orange
      case GhostMode.Eaten:
      case GhostMode.ReturningHome: return '#bbbbbb'; // grey
      case GhostMode.InHouse: return '#aaaa00';     // yellow-ish
      default: return '#ffffff';
    }
  }

  update(ghosts: Ghost[], schedulerMode: GhostMode | null): void {
    // header
    const sched = schedulerMode ? GhostMode[schedulerMode] ?? String(schedulerMode) : '—';
    this.headerText.setText(`Ghosts (Scheduler: ${sched})`);

    // body lines
    this.ensureLineCount(ghosts.length);

    ghosts.forEach((g, i) => {
      const mode = g.getMode();
      const name = g.name ?? `G${i + 1}`;
      const line = this.lines[i];

      // position: header occupies 1 line; add small gap
      line.setPosition(0, this.lineH * (i + 1) + 4);

      // color by mode for quick glance
      line.setColor(this.modeColor(mode));

      line.setText(`${name.padEnd(8)} : ${GhostMode[mode] ?? String(mode)}`);
    });

    // resize bg height to fit
    const h = this.lineH * (1 + ghosts.length) + 8;
    this.bg.setSize(this.w, h);
  }

  destroy(): void {
    this.container.destroy(true);
    this.lines = [];
  }
}