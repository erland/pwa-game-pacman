import Phaser from 'phaser';
import { BaseMenuScene } from '@erlandlindmark/pwa-game-2d-framework';

/** Minimal menu powered by BaseMenuScene (title + pulsing hint + Enter/Space/Pointer to start). */
export class MenuScene extends BaseMenuScene {
  /** Optional background (e.g., color fill, parallax, logo). */
  protected buildBackground(): void {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x101018).setOrigin(0, 0);
  }

  /** Hook to add extra UI without overriding create(). */
  protected afterCreate(): void {
    const { width, height } = this.scale;
    this.add.text(width * 0.5, height * 0.75, 'This is the Base* menu', this.getTheme().typography.small).setOrigin(0.5);
  }
}
