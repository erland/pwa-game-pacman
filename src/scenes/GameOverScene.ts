import { BaseGameOverScene } from '@erlandlindmark/pwa-game-2d-framework';

/** Minimal Game Over scene (pulsing hint + Enter/Space/Pointer to retry). */
export class GameOverScene extends BaseGameOverScene {
  protected getTitle(): string { return 'Game Over'; }
  protected getNextSceneKey(): string { return 'Play'; } // retry jumps back into Play
}
