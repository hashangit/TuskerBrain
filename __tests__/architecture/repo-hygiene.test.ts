import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(fullPath);
      }
      return [fullPath];
    })
  );

  return files.flat();
}

describe('repository hygiene', () => {
  it('keeps seed imports portable', async () => {
    const seedPath = path.join(process.cwd(), 'database', 'seed.ts');
    const seedSource = await readFile(seedPath, 'utf8');

    expect(seedSource).toContain("from './schema'");
    expect(seedSource).not.toContain('/Users/');
  });

  it('keeps development backup files out of source', async () => {
    const sourceFiles = await collectFiles(path.join(process.cwd(), 'src'));
    const backupFiles = sourceFiles
      .filter((file) => file.endsWith('.bak'))
      .map((file) => path.relative(process.cwd(), file));

    expect(backupFiles).toEqual([]);
  });

  it('keeps generated JavaScript out of TypeScript source folders', async () => {
    const sourceFiles = await collectFiles(path.join(process.cwd(), 'src'));
    const generatedJavaScript = sourceFiles
      .filter((file) => file.endsWith('.js'))
      .map((file) => path.relative(process.cwd(), file));

    expect(generatedJavaScript).toEqual([]);
  });

  it('keeps renderer code from importing database modules', async () => {
    const sourceFiles = await collectFiles(path.join(process.cwd(), 'src'));
    const offenders: string[] = [];

    await Promise.all(sourceFiles
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .map(async (file) => {
        const source = await readFile(file, 'utf8');
        if (/from ['"][^'"]*database\//.test(source)) {
          offenders.push(path.relative(process.cwd(), file));
        }
      }));

    expect(offenders.sort()).toEqual([]);
  });

  it('keeps deal UI helpers out of the database layer', async () => {
    const databaseFiles = await collectFiles(path.join(process.cwd(), 'database'));
    const dealHelperFiles = databaseFiles
      .filter((file) => path.basename(file) === 'deals.ts')
      .map((file) => path.relative(process.cwd(), file));

    expect(dealHelperFiles).toEqual([]);
  });

  it('ignores backup files created by local editors', async () => {
    const gitignore = await readFile(path.join(process.cwd(), '.gitignore'), 'utf8');

    expect(gitignore).toContain('*.bak');
  });
});
