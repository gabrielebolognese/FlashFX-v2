import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const CHUNK_SIZE = 120;
const VIEW_BOX = '0 0 24 24';

const iconNodesPath = join(projectRoot, 'node_modules/lucide-static/icon-nodes.json');
const tagsPath = join(projectRoot, 'node_modules/lucide-static/tags.json');

if (!existsSync(iconNodesPath)) {
  console.error(`Missing ${iconNodesPath}. Did you install lucide-static?`);
  process.exit(1);
}

const iconNodes = JSON.parse(readFileSync(iconNodesPath, 'utf-8'));
const tagsMap = JSON.parse(readFileSync(tagsPath, 'utf-8'));

function titleCase(str) {
  return str
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function buildIcon(id, nodes) {
  const segmentTags = id.split('-').filter((s) => s.length > 1);
  const sourceTags = tagsMap[id] ?? [];
  const tagSet = new Set([...segmentTags, ...sourceTags]);

  const elements = nodes.map(([tag, attrs]) => {
    const cleanAttrs = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'fill') continue;
      if (k === 'key') continue;
      cleanAttrs[k] = String(v);
    }
    return { tag, attrs: cleanAttrs };
  });

  return {
    id,
    name: titleCase(id),
    tags: [...tagSet],
    viewBox: VIEW_BOX,
    elements,
  };
}

const ids = Object.keys(iconNodes).sort();
const icons = ids.map((id) => buildIcon(id, iconNodes[id]));

console.log(`Processing ${icons.length} icons...`);

const chunksDir = join(projectRoot, 'public/icons/chunks');
rmSync(chunksDir, { recursive: true, force: true });
mkdirSync(chunksDir, { recursive: true });

const indexEntries = [];
let chunkIndex = 0;

for (let i = 0; i < icons.length; i += CHUNK_SIZE) {
  const slice = icons.slice(i, i + CHUNK_SIZE);
  const chunkName = `chunk-${chunkIndex}`;
  const chunkPath = join(chunksDir, `${chunkName}.json`);
  writeFileSync(chunkPath, JSON.stringify(slice));

  for (const icon of slice) {
    indexEntries.push({
      id: icon.id,
      name: icon.name,
      tags: icon.tags,
      chunk: chunkName,
    });
  }
  chunkIndex++;
}

const indexPath = join(projectRoot, 'public/icons/index.json');
writeFileSync(indexPath, JSON.stringify(indexEntries));

console.log(`Wrote ${chunkIndex} chunks to public/icons/chunks/`);
console.log(`Wrote index with ${indexEntries.length} entries to public/icons/index.json`);
