import Phaser from 'phaser';
import { BasePlayScene } from '@erlandlindmark/pwa-game-2d-framework';

/** Simple demo Play scene using the framework's fixed-step loop. */
export class PlayScene extends BasePlayScene {
  private t = 0;
  private label!: Phaser.GameObjects.Text;

  constructor() {
    // Example: 60 Hz fixed-step with up to 5 catch-up steps per frame
    super({ hz: 60, maxCatchUp: 5 }, 'Play');
  }

  /** Build your world here. */
  protected buildWorld(): void {
    // ESC to open pause overlay
    this.input.keyboard?.on('keydown-ESC', () => this.scene.launch('Pause'));
    const { width, height } = this.scale;
    this.label = this.add.text(width / 2, height / 2, 'GAME RUNNING…', { color: '#0f0' }).setOrigin(0.5);
    // For the demo, auto-finish after 3 seconds:
    this.time.delayedCall(3000, () => this.scene.start('GameOver'));
  }

  /** Step your deterministic simulation here (called at fixed Hz). */
  protected tick(dtMs: number): void {
    this.t += dtMs;
  }

  /** Do any per-frame rendering / effects here (called once per RAF frame). */
  protected frame(_deltaMs: number): void {
    if (this.label) this.label.setAlpha(0.7 + 0.3 * Math.sin(this.t * 0.01));
  }
}
