import { GameHost } from '@erlandlindmark/pwa-game-2d-framework';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { PlayScene } from './scenes/PlayScene';
import { PauseScene } from './scenes/PauseScene';
import { GameOverScene } from './scenes/GameOverScene';

/** Launch with sensible defaults (resize mode, pixelArt, etc.). */
GameHost.launch('app', [BootScene, MenuScene, PlayScene, PauseScene, GameOverScene], {
  width: 800,
  height: 600,
  backgroundColor: 0x000000,
  scaleMode: 'resize', // or 'fit' / 'cover'
  physics: false,      // set to { system: 'arcade' } or { system: 'matter' } if needed
});
