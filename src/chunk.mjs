export const DISCORD_LIMIT = 2000;
const CHUNK_LIMIT = 1900;

/**
 * Cat cau tra loi thanh cac doan <= 1900 ky tu de gui Discord (gioi han 2000).
 * Giu code fence: neu cat giua ``` thi dong lai o doan truoc va mo lai o doan sau.
 */
export function chunkForDiscord(text) {
  const chunks = [];
  let current = '';
  let fenceOpen = false;
  let fenceLang = '';

  const push = () => {
    if (!current.trim()) {
      current = '';
      return;
    }
    let piece = current.trimEnd();
    if (fenceOpen) piece += '\n```';
    chunks.push(piece);
    current = fenceOpen ? '```' + fenceLang + '\n' : '';
  };

  for (const rawLine of String(text ?? '').split('\n')) {
    let line = rawLine;

    // Dong sieu dai (khong co newline) -> cat cung
    while (line.length > CHUNK_LIMIT - 10) {
      const head = line.slice(0, CHUNK_LIMIT - 10);
      if (current.length + head.length + 1 > CHUNK_LIMIT) push();
      current += head + '\n';
      line = line.slice(CHUNK_LIMIT - 10);
    }

    if (current.length + line.length + 1 > CHUNK_LIMIT) push();
    current += line + '\n';

    const fence = line.trim().match(/^```(\w*)/);
    if (fence) {
      if (fenceOpen) {
        fenceOpen = false;
        fenceLang = '';
      } else {
        fenceOpen = true;
        fenceLang = fence[1] || '';
      }
    }
  }

  if (current.trim()) chunks.push(fenceOpen ? current.trimEnd() + '\n```' : current.trimEnd());
  return chunks.length ? chunks : ['(rỗng)'];
}
