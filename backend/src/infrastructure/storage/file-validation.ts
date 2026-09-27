import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../common/http/api.exception';

const invalidFile = (message: string) =>
  new ApiException(HttpStatus.BAD_REQUEST, 'INVALID_FILE', message);

/** Accepted document formats, detected from file content (not the client's claimed type). */
const SIGNATURES: { type: string; extension: string; bytes: number[] }[] = [
  { type: 'application/pdf', extension: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { type: 'image/png', extension: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/jpeg', extension: 'jpg', bytes: [0xff, 0xd8, 0xff] },
];

export interface UploadedFile {
  buffer: Buffer;
  size: number;
}

/** API_SPEC §109: verify file type and size before storing (INVALID_FILE otherwise). */
export function detectDocumentType(
  file: UploadedFile | undefined,
  maxBytes: number,
): { type: string; extension: string } {
  if (!file || file.size === 0) throw invalidFile('A file is required.');
  if (file.size > maxBytes) throw invalidFile(`File must be at most ${maxBytes} bytes.`);
  const match = SIGNATURES.find((signature) =>
    signature.bytes.every((byte, index) => file.buffer[index] === byte),
  );
  if (!match) throw invalidFile('Only PDF, PNG or JPEG files are accepted.');
  return { type: match.type, extension: match.extension };
}
