import { BasePauseOverlay, defaultSceneKeys } from '@erlandlindmark/pwa-game-2d-framework';

/** ESC / tap resumes, wired by BasePauseOverlay. */
export class PauseScene extends BasePauseOverlay {
  protected getSceneKeys() {
    return { ...defaultSceneKeys, play: 'Game' };
  }
}
