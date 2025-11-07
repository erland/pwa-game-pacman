import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'audio');

const SAMPLE_RATE = 44100;
const MAX_AMPLITUDE = 0x7fff;

const CUES = [
  { file: 'chomp.wav', frequency: 660, duration: 0.08, repeats: 2 },
  { file: 'power_pellet.wav', frequency: 220, duration: 0.6, tremolo: 8 },
  { file: 'ghost_eaten.wav', frequency: 880, duration: 0.35, glide: -220 },
  { file: 'player_death.wav', frequency: 440, duration: 1.2, glide: -330 },
  { file: 'level_start.wav', frequency: 523.25, duration: 0.8, sequence: [523.25, 659.25, 783.99, 1046.5] },
  { file: 'fruit_spawn.wav', frequency: 392, duration: 0.4, repeats: 3 },
];

function createSamples({
  frequency,
  duration,
  repeats = 1,
  tremolo = 0,
  glide = 0,
  sequence,
}) {
  if (sequence && sequence.length) {
    const perNoteDuration = duration / sequence.length;
    return sequence.flatMap((freq) =>
      createSamples({ frequency: freq, duration: perNoteDuration, repeats: 1, tremolo, glide: 0, sequence: undefined })
    );
  }

  const sampleCount = Math.floor(duration * SAMPLE_RATE);
  const samples = new Int16Array(sampleCount * repeats);

  for (let r = 0; r < repeats; r += 1) {
    for (let i = 0; i < sampleCount; i += 1) {
      const globalIndex = r * sampleCount + i;
      const t = i / SAMPLE_RATE;
      const baseFreq = frequency + (glide * (i / sampleCount));
      const amplitudeEnvelope = envelope(i, sampleCount);
      const tremoloFactor = tremolo ? 0.5 + 0.5 * Math.sin(2 * Math.PI * tremolo * t) : 1;
      const sample = Math.sin(2 * Math.PI * baseFreq * t) * amplitudeEnvelope * tremoloFactor;
      samples[globalIndex] = Math.round(sample * MAX_AMPLITUDE * 0.5);
    }
  }

  return Array.from(samples);
}

function envelope(index, total) {
  const attack = Math.floor(total * 0.05);
  const release = Math.floor(total * 0.15);

  if (index < attack) {
    return index / attack;
  }

  if (index > total - release) {
    return (total - index) / release;
  }

  return 1;
}

function encodeWav(samples) {
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  samples.forEach((sample, index) => {
    buffer.writeInt16LE(sample, 44 + index * 2);
  });

  return buffer;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  await Promise.all(
    CUES.map(async (cue) => {
      const samples = createSamples(cue);
      const wav = encodeWav(samples);
      const outputPath = path.join(OUTPUT_DIR, cue.file);
      await fs.writeFile(outputPath, wav);
      console.log(`Generated ${path.relative(ROOT_DIR, outputPath)}`);
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
