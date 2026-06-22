import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8');

function assetExists(filename: string): boolean {
  return existsSync(fileURLToPath(new URL(`./assets/${filename}`, import.meta.url)));
}

function readPng(filename: string): { width: number; height: number; pixelAt: (x: number, y: number) => [number, number, number, number] } {
  const data = readFileSync(fileURLToPath(new URL(`./assets/${filename}`, import.meta.url)));
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idatChunks: Buffer[] = [];

  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    offset += 4;
    const type = data.toString('ascii', offset, offset + 4);
    offset += 4;
    const chunk = data.subarray(offset, offset + length);
    offset += length + 4;

    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === 'IDAT') {
      idatChunks.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
  }

  expect(bitDepth).toBe(8);
  expect([2, 6]).toContain(colorType);

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const rowLength = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  let previous = Buffer.alloc(rowLength);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.from(raw.subarray(sourceOffset, sourceOffset + rowLength));
    sourceOffset += rowLength;

    for (let x = 0; x < rowLength; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels] ?? 0 : 0;
      let predictor = 0;

      if (filter === 1) {
        predictor = left;
      } else if (filter === 2) {
        predictor = up;
      } else if (filter === 3) {
        predictor = Math.floor((left + up) / 2);
      } else if (filter === 4) {
        const target = left + up - upLeft;
        const leftDistance = Math.abs(target - left);
        const upDistance = Math.abs(target - up);
        const upLeftDistance = Math.abs(target - upLeft);
        predictor = leftDistance <= upDistance && leftDistance <= upLeftDistance ? left : upDistance <= upLeftDistance ? up : upLeft;
      }

      row[x] = (row[x] + predictor) & 255;
    }

    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      pixels[target] = row[source];
      pixels[target + 1] = row[source + 1];
      pixels[target + 2] = row[source + 2];
      pixels[target + 3] = channels === 4 ? row[source + 3] : 255;
    }

    previous = row;
  }

  return {
    width,
    height,
    pixelAt: (x, y) => {
      const index = (y * width + x) * 4;
      return [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
    },
  };
}

describe('Eli avatar assets', () => {
  it('uses the blue v2 layered artwork for the header avatar', () => {
    for (const filename of ['eli-blue-default-v2.png', 'eli-blue-thinking-base-v2.png', 'eli-blue-thinking-indicator-v2.png']) {
      expect(appSource).toContain(filename);
      expect(assetExists(filename)).toBe(true);
    }

    expect(appSource).not.toContain('eli-blue-idle.png');
    expect(appSource).not.toContain('eli-blue-active.png');
  });

  it('uses the clean white v2 static and animated artwork for light avatars', () => {
    for (const filename of ['eli-white-default-clean-v2.png', 'eli-white-thinking-clean-v2.png', 'eli-white-thinking-loop-clean-v2.webp']) {
      expect(appSource).toContain(filename);
      expect(assetExists(filename)).toBe(true);
    }

    expect(appSource).not.toContain('eli-agent.png');
    expect(appSource).not.toContain('eli-agent-blink.png');
  });

  it('keeps the header blue artwork tightly cropped and consistently sized', () => {
    const images = ['eli-blue-default-v2.png', 'eli-blue-thinking-base-v2.png', 'eli-blue-thinking-indicator-v2.png'].map(readPng);

    expect(images.map(({ width, height }) => `${width}x${height}`)).toEqual(['1008x702', '1008x702', '1008x702']);
  });

  it('keeps the light avatar PNGs transparent at the matte edges', () => {
    for (const image of [readPng('eli-white-default-clean-v2.png'), readPng('eli-white-thinking-clean-v2.png')]) {
      expect(image.pixelAt(0, 0)[3]).toBe(0);
      expect(image.pixelAt(image.width - 1, 0)[3]).toBe(0);
      expect(image.pixelAt(0, image.height - 1)[3]).toBe(0);
      expect(image.pixelAt(image.width - 1, image.height - 1)[3]).toBe(0);
    }
  });

  it('sizes the workbench avatar a little larger and floats active avatars subtly', () => {
    expect(appSource).toContain("<EliMark active={eliIsActive} tone={eliNeedsDecision ? 'waiting' : 'active'} size={36} />");
    expect(appSource).toContain('@keyframes eliThinkingFloat');
    expect(appSource).toContain("active ? 'eliThinkingFloat 2.8s ease-in-out infinite' : 'none'");
  });
});
