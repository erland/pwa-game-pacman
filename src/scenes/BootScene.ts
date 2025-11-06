import { BaseBootScene, defaultTheme } from '@erlandlindmark/pwa-game-2d-framework';

/** Ensures services are created and jumps to MainMenu. */
export class BootScene extends BaseBootScene {
  /** Optionally tweak the default theme title used by Base* scenes. */
  protected getBootTheme() {
    return { ...defaultTheme, title: 'Basic Template' };
  }

  /** Example UI override: request fullscreen automatically on start. */
  protected getServiceOverrides() {
    return { ui: { autoFullscreen: false } };
  }

  /** Preload assets here if your menu/play needs them immediately. */
  protected preloadAssets(): void {
    // e.g., this.load.image('logo', 'assets/logo.png');
  }
}
