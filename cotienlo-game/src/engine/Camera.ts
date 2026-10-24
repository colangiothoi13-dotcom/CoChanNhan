export class Camera {
  public x: number = 0;
  public y: number = 0;
  public viewportWidth: number = 800;
  public viewportHeight: number = 600;
  public worldWidth: number = 2400;
  public worldHeight: number = 2400;
  public smoothFactor: number = 0.12;
  public shake: number = 0;

  constructor(viewportWidth: number, viewportHeight: number) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
  }

  public resize(width: number, height: number) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  public follow(targetX: number, targetY: number) {
    // Target camera position is centered on target
    const desiredX = targetX - this.viewportWidth / 2;
    const desiredY = targetY - this.viewportHeight / 2;

    // Smooth lerp
    this.x += (desiredX - this.x) * this.smoothFactor;
    this.y += (desiredY - this.y) * this.smoothFactor;

    // Clamp inside world bounds
    this.x = Math.max(0, Math.min(this.x, this.worldWidth - this.viewportWidth));
    this.y = Math.max(0, Math.min(this.y, this.worldHeight - this.viewportHeight));

    // Environmental Cataclysm Screen Shake
    if (this.shake > 0) {
      this.x += (Math.random() - 0.5) * this.shake;
      this.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - 0.1);
    }
  }

  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX - this.x,
      y: worldY - this.y,
    };
  }

  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: screenX + this.x,
      y: screenY + this.y,
    };
  }
}
