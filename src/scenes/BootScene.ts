import { BaseBootScene, defaultSceneKeys, defaultTheme } from '@erlandlindmark/pwa-game-2d-framework';
import { AUDIO_CONFIG, MAP_CONFIG, SPRITE_SHEET_CONFIG } from '../game/config';

/** Ensures services are created and jumps to MainMenu. */
export class BootScene extends BaseBootScene {
  /** Optionally tweak the default theme title used by Base* scenes. */
  protected getBootTheme() {
    return { ...defaultTheme, title: 'Pac-Man' };
  }

  /** Example UI override: request fullscreen automatically on start. */
  protected getServiceOverrides() {
    return { ui: { autoFullscreen: false } };
  }

  protected getSceneKeys() {
    return { ...defaultSceneKeys, play: 'Game' };
  }

  /** Preload assets here if your menu/play needs them immediately. */
  protected preloadAssets(): void {
    this.load.spritesheet(SPRITE_SHEET_CONFIG.key, SPRITE_SHEET_CONFIG.url, {
      frameWidth: SPRITE_SHEET_CONFIG.frameWidth,
      frameHeight: SPRITE_SHEET_CONFIG.frameHeight,
    });
    this.load.image(MAP_CONFIG.tilesetKey, MAP_CONFIG.tilesetImageUrl);
    this.load.tilemapTiledJSON(MAP_CONFIG.key, MAP_CONFIG.url);

    Object.values(AUDIO_CONFIG).forEach((entry) => {
      this.load.audio(entry.key, entry.url);
    });
  }
}
