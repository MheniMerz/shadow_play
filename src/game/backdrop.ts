/** Static painted scenery is baked into the shadow-receiving paper texture.
 * It adds no draw calls and, unlike an overlay, cannot cover the real hand shadow. */
export function paintBackdrop(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.save();
  g.scale(w / 1024, h / 744);
  const sky = g.createLinearGradient(0, 0, 0, 744);
  sky.addColorStop(0, '#e0d9bd');
  sky.addColorStop(0.48, '#faf0d4');
  sky.addColorStop(1, '#b4c1ae');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 744);
  const halo = g.createRadialGradient(675, 210, 12, 675, 210, 230);
  halo.addColorStop(0, 'rgba(255,248,211,0.8)');
  halo.addColorStop(1, 'rgba(255,248,211,0)');
  g.fillStyle = halo;
  g.fillRect(400, 0, 550, 480);
  // Three soft paper layers; the middle stays open for the player's hand shadow.
  const layers = [
    { y: 470, amp: 45, color: '#c6cbb5', phase: 0.2 },
    { y: 525, amp: 52, color: '#aebba6', phase: 2.5 },
    { y: 603, amp: 31, color: '#8fa797', phase: 0.6 },
  ];
  for (const layer of layers) {
    g.beginPath();
    g.moveTo(0, 744);
    for (let x = 0; x <= 1024; x += 8) {
      const y = layer.y + Math.sin(x / 165 + layer.phase) * layer.amp + Math.sin(x / 79 + layer.phase) * 8;
      g.lineTo(x, y);
    }
    g.lineTo(1024, 744);
    g.closePath();
    g.fillStyle = layer.color;
    g.fill();
  }
  // Fine botanical silhouettes frame the action instead of filling its centre.
  for (const side of [-1, 1]) {
    g.save();
    g.translate(side === -1 ? 0 : 1024, 0);
    g.scale(-side, 1);
    g.strokeStyle = '#96a58e';
    g.fillStyle = '#96a58e';
    g.lineCap = 'round';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(16, 650);
    g.bezierCurveTo(68, 470, 28, 290, 90, 105);
    g.stroke();
    for (let i = 0; i < 11; i++) {
      const y = 155 + i * 39;
      const x = 55 - Math.sin(i * 0.5) * 16;
      const direction = i % 2 ? 1 : -1;
      g.save();
      g.translate(x, y);
      g.rotate(direction * 0.65);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(23, -33, 58, -22);
      g.quadraticCurveTo(38, 4, 0, 0);
      g.fill();
      g.restore();
    }
    g.restore();
  }
  // Sparse specks of gold, like flecks in handmade paper.
  g.fillStyle = '#b69b61';
  for (const [x, y, r] of [[172, 99, 2], [395, 162, 1.5], [808, 87, 2], [875, 310, 1.5], [320, 296, 1], [520, 68, 1.5]]) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(129,109,66,0.3)';
  g.lineWidth = 1;
  g.strokeRect(18, 18, 988, 708);
  g.restore();
}
