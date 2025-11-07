import { BaseGameOverScene, defaultSceneKeys } from '@erlandlindmark/pwa-game-2d-framework';

/** Minimal Game Over scene (pulsing hint + Enter/Space/Pointer to retry). */
export class GameOverScene extends BaseGameOverScene {
  protected getTitle(): string { return 'Game Over'; }
  protected getSceneKeys() {
    return { ...defaultSceneKeys, play: 'Game' };
  }
  protected getNextSceneKey(): string { return 'Game'; } // retry jumps back into Game
}
