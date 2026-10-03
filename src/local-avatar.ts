const key = 'truco-local-avatar';

export function readLocalAvatar() {
  const value = localStorage.getItem(key);
  return value?.startsWith('data:image/webp;base64,') ? value : null;
}

export function saveLocalAvatar(value: string | null) {
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}

export async function prepareLocalAvatar(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8_000_000) {
    throw new Error('Elegí una imagen JPG, PNG o WebP de hasta 8 MB.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 160;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la foto.');
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 160, 160);
    return canvas.toDataURL('image/webp', 0.78);
  } finally {
    bitmap.close();
  }
}
