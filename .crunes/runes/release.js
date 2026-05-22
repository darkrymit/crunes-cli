import { fs, json, shell, section, md } from '@utils'

export async function use() {
  const version     = await json.get('package.json', '$.version', 'unknown')
  const lockVersion = await json.get('package-lock.json', '$.version', 'unknown')
  const name        = await json.get('package.json', '$.name', '')

  const programSrc = await fs.read('src/program.js', { throw: false }) ?? ''
  const cliVersionMatch = programSrc.match(/\.version\(['"]([^'"]+)['"]/)
  const cliVersion = cliVersionMatch ? cliVersionMatch[1] : 'unknown'

  const gitLog = await shell('git log --oneline -10 --no-decorate', { throw: false, trim: true })
  const branch  = await shell('git rev-parse --abbrev-ref HEAD', { throw: false, trim: true })
  const lastTag = await shell('git describe --tags --abbrev=0', { throw: false, trim: true })
  const unpushed = await shell('git rev-list --count @{u}..HEAD', { throw: false, trim: true })

  const changelog = await fs.read('CHANGELOG.md', { throw: false }) ?? ''
  const recent = changelog
    .split(/(?=^## \[)/m)
    .filter(s => s.startsWith('## ['))
    .slice(0, 3)
    .map(s => s.trim())
    .join('\n\n')
    .trim()

  const sections = []

  sections.push(section.create('version', {
    type: 'markdown',
    content: md.table(
      ['Field', 'Value'],
      [
        ['Package',      md.code(name)],
        ['Version',      md.code(version)],
        ['Lock version', lockVersion === version ? `${md.code(lockVersion)} ✓` : `${md.code(lockVersion)} ⚠ out of sync`],
        ['CLI version',  cliVersion === version ? `${md.code(cliVersion)} ✓` : `${md.code(cliVersion)} ⚠ out of sync`],
        ['Branch',       md.code(branch || '—')],
        ['Last tag',     md.code(lastTag || '—')],
        ['Unpushed',     unpushed ? `${unpushed} commit(s)` : '0 (in sync)'],
      ]
    ),
  }, { title: 'Version & Status' }))

  if (gitLog) {
    sections.push(section.create('commits', {
      type: 'markdown',
      content: md.codeBlock(gitLog, 'text'),
    }, { title: 'Recent Commits (last 10)' }))
  }

  sections.push(section.create('changelog', {
    type: 'markdown',
    content: recent || '_No CHANGELOG.md found._',
  }, { title: 'Recent Changelog' }))

  sections.push(section.create('process', {
    type: 'markdown',
    content: md.ol([
      `Bump version in ${md.code('package.json')} then run ${md.code('npm install')} to sync lockfile`,
      `Add ${md.code('## [x.y.z] - YYYY-MM-DD')} entry to ${md.code('CHANGELOG.md')}`,
      'Commit, tag, push — publish CI fires on the tag automatically',
    ]),
  }, { title: 'Release Process' }))

  return sections
}
