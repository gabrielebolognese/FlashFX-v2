// PB7 - pure chunk-range planning for the large local video assets that videoAssetStore splits into
// fixed-size IndexedDB chunks (CHUNK_THRESHOLD 512MB, CHUNK_SIZE 256MB). Today readChunked reads EVERY
// chunk record up front and joins them (`new Blob(parts)`); this planner is the primitive a LAZY
// mediabunny CustomSource.read(start,end) needs to fetch ONLY the chunk record(s) overlapping a
// requested byte range, so opening a project with a multi-GB clip no longer pulls every chunk out of IDB
// before the demuxer reads a byte. Pure + dependency-free -> unit-tested (verify:chunk-plan). The
// arithmetic mirrors saveChunked's `file.slice(i*CHUNK, (i+1)*CHUNK)` loop so a planned read maps back
// onto exactly the bytes that were stored.
//
// This is the deliverable primitive; wiring a CustomSource onto it (the actual lazy decode) is the
// browser-gated PB7-lazy split, since it must be verified against a real mediabunny/WebCodecs decode.

export interface ChunkReadPart {
  /** Which stored chunk record this slice comes from (key `${assetId}-chunk-${chunkIndex}`). */
  chunkIndex: number;
  /** Inclusive byte offset WITHIN that chunk to start reading. */
  startInChunk: number;
  /** Exclusive byte offset WITHIN that chunk to stop reading. */
  endInChunk: number;
}

/** How many chunks a file of `fileSize` bytes splits into at `chunkSize`. 0 for degenerate input. */
export function chunkCount(fileSize: number, chunkSize: number): number {
  if (!(fileSize > 0) || !(chunkSize > 0)) return 0;
  return Math.ceil(fileSize / chunkSize);
}

/**
 * The ordered chunk slices that together cover the requested [start, end) byte range of a file split
 * into `chunkSize` chunks. The range is clamped to [0, fileSize); an empty or degenerate range yields [].
 * Concatenating the returned slices (in order) reproduces exactly `fileBytes[start:end]`.
 */
export function planChunkRange(
  fileSize: number,
  chunkSize: number,
  start: number,
  end: number,
): ChunkReadPart[] {
  if (!(fileSize > 0) || !(chunkSize > 0)) return [];
  const s = Math.max(0, Math.min(start, fileSize));
  const e = Math.max(0, Math.min(end, fileSize));
  if (e <= s) return [];

  const firstChunk = Math.floor(s / chunkSize);
  const lastChunk = Math.floor((e - 1) / chunkSize); // e is exclusive, so the last touched byte is e-1
  const parts: ChunkReadPart[] = [];
  for (let i = firstChunk; i <= lastChunk; i++) {
    const chunkStart = i * chunkSize;
    parts.push({
      chunkIndex: i,
      startInChunk: Math.max(0, s - chunkStart),
      endInChunk: Math.min(chunkSize, e - chunkStart),
    });
  }
  return parts;
}
