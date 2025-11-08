export interface GridEnv {
  /** Tile size in pixels. */
  tileSize: number;
  /** Convert world -> integer tile coords. */
  worldToTile(x: number, y: number): { tx: number; ty: number };
  /** Tile center in world coordinates. */
  tileCenterWorld(tx: number, ty: number): { x: number; y: number };
  /** True if this world position is blocked (wall/door). */
  isBlocked(worldX: number, worldY: number): boolean;
  /** True if this tile may be entered. */
  canEnterTile(tx: number, ty: number): boolean;
}