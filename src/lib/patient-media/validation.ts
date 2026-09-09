export const PATIENT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const PATIENT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function validatePatientImage(file: File): string | null {
  if (!PATIENT_IMAGE_MIME_TYPES.includes(file.type as (typeof PATIENT_IMAGE_MIME_TYPES)[number])) {
    return 'Envie uma imagem JPG, PNG ou WebP.';
  }
  if (file.size <= 0 || file.size > PATIENT_IMAGE_MAX_BYTES) {
    return 'A imagem deve ter no máximo 8 MB.';
  }
  return null;
}

export function extensionForMimeType(mimeType: string): 'jpg' | 'png' | 'webp' {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export function hasValidImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (mimeType === 'image/webp') {
    return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}
