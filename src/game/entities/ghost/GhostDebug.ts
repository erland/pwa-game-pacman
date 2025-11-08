import Phaser from 'phaser';
import { DIRS } from './GhostTypes';
import { TILE_SIZE } from '../../config';
import { GhostNavCtx, allowedDirections, blockReason } from './GhostUtils';
import { PacManDirection } from '../PacMan';
import { dirName } from './GhostTypes';

export type DebugHandles = {
  gfx?: Phaser.GameObjects.Graphics;
  text?: Phaser.GameObjects.Text;
};

export function ensureDebugDrawables(
  scene: Phaser.Scene,
  handles: DebugHandles
): DebugHandles {
  if (!handles.gfx) handles.gfx = scene.add.graphics().setDepth(1000);
  if (!handles.text) {
    handles.text = scene.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: C.text,
      align: 'left',
    }).setDepth(1001);
  }
  return handles;
}

export function clearDebugDraw(handles: DebugHandles) {
  handles.gfx?.clear();
  handles.text?.setText('');
}

export function drawGhostDebug(
  scene: Phaser.Scene,
  ctx: GhostNavCtx & { name: string; currentDirection: PacManDirection | null; doorRect: Phaser.Geom.Rectangle; },
  target: { x: number; y: number },
  handles: DebugHandles
) {
  const gfx = handles.gfx!;
  const text = handles.text!;
  gfx.clear();

  // door
  gfx.lineStyle(2, C.door, 0.9).strokeRectShape(ctx.doorRect);

  // here + target
  const here = ctx.getTile();
  const wx = ctx.mazeLayer.tileToWorldX(here.x) + TILE_SIZE / 2;
  const wy = ctx.mazeLayer.tileToWorldY(here.y) + TILE_SIZE / 2;
  gfx.fillStyle(C.here, 0.8).fillCircle(wx, wy, 3);

  const trX = ctx.mazeLayer.tileToWorldX(target.x);
  const trY = ctx.mazeLayer.tileToWorldY(target.y);
  gfx.lineStyle(2, C.target, 1).strokeRect(trX, trY, TILE_SIZE, TILE_SIZE);

  // allowed rays
  const allowed = allowedDirections(ctx);
  gfx.lineStyle(2, C.allowed, 0.9);
  for (const d of DIRS) {
    const v = { x: 0, y: 0, ...d } as any; // not used; draw fixed rays
  }
  // draw simple 4 rays
  gfx.strokeLineShape(new Phaser.Geom.Line(wx, wy, wx, wy - TILE_SIZE * 0.5));
  gfx.strokeLineShape(new Phaser.Geom.Line(wx - TILE_SIZE * 0.5, wy, wx + TILE_SIZE * 0.5, wy));
  gfx.strokeLineShape(new Phaser.Geom.Line(wx, wy, wx, wy + TILE_SIZE * 0.5));

  // neighbor tiles with block reasons
  for (const d of DIRS) {
    const n = { x: here.x, y: here.y };
    if (d === PacManDirection.Up) n.y -= 1;
    if (d === PacManDirection.Down) n.y += 1;
    if (d === PacManDirection.Left) n.x -= 1;
    if (d === PacManDirection.Right) n.x += 1;

    const rectX = ctx.mazeLayer.tileToWorldX(n.x);
    const rectY = ctx.mazeLayer.tileToWorldY(n.y);
    const reason = blockReason(ctx, n.x, n.y);
    const open = reason.startsWith('open') || reason.endsWith('pass');
    gfx.lineStyle(2, open ? C.open : C.blocked, 1).strokeRect(rectX, rectY, TILE_SIZE, TILE_SIZE);
    gfx.fillStyle(0x000000, 0.6).fillRect(rectX - 1, rectY - 10, TILE_SIZE + 2, 10);

    scene.add.text(rectX + 2, rectY - 10, reason, {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: open ? '#55ff55' : '#ff6666',
    }).setDepth(1001).setScrollFactor(1).setAlpha(0.9).setName('ghostDbgTmp').setOrigin(0, 0);
  }

  // current dir vector
  if (ctx.currentDirection) {
    gfx.lineStyle(3, C.currentDir, 1);
    const v =
      ctx.currentDirection === PacManDirection.Left
        ? { x: -1, y: 0 }
        : ctx.currentDirection === PacManDirection.Right
        ? { x: 1, y: 0 }
        : ctx.currentDirection === PacManDirection.Up
        ? { x: 0, y: -1 }
        : { x: 0, y: 1 };
    gfx.strokeLineShape(new Phaser.Geom.Line(wx, wy, wx + v.x * TILE_SIZE * 0.5, wy + v.y * TILE_SIZE * 0.5));
  }

  text.setText(
    `${ctx.name} ${ctx.mode}\n` +
    `tile ${here.x},${here.y} dir=${dirName(ctx.currentDirection)}\n` +
    `allowed: ${allowed.map(dirName).join(', ')}`
  );
  text.setPosition(wx + 6, wy - 24);

  // cleanup transient texts from previous frame
  scene.children.list
    .filter(obj => obj.name === 'ghostDbgTmp')
    .forEach(obj => obj.destroy());
}