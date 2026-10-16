import { readFile, writeFile } from 'node:fs/promises';

const spec = JSON.parse(await readFile(new URL('../openapi/v1.json', import.meta.url), 'utf8'));
const catalog = spec['x-payri-error-catalog'];

if (catalog === null || typeof catalog !== 'object' || Array.isArray(catalog)) {
  throw new TypeError('openapi/v1.json must define an x-payri-error-catalog object.');
}

const errorCodes = Object.keys(catalog).sort();
const scopes = new Set();

for (const operationGroup of [spec.paths, spec.webhooks]) {
  for (const pathItem of Object.values(operationGroup ?? {})) {
    for (const operation of Object.values(pathItem ?? {})) {
      if (operation === null || typeof operation !== 'object' || !('operationId' in operation)) continue;
      for (const scope of operation['x-payri-scope'] ?? []) scopes.add(scope);
    }
  }
}

function typeDeclaration(name, values) {
  return `export type ${name} =\n${values.map((value) => `  | ${JSON.stringify(value)}`).join('\n')};`;
}

const output = [
  '// 이 파일은 openapi/v1.json 에서 생성됩니다. 직접 수정하지 마세요.',
  '',
  typeDeclaration('PayriKnownErrorCode', errorCodes),
  '',
  typeDeclaration('ApiKeyScope', [...scopes].sort()),
  '',
].join('\n');

await writeFile(new URL('../src/generated/spec-extensions.ts', import.meta.url), output, 'utf8');
