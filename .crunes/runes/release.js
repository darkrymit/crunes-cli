import { fs, json, shell, section, md } from '@utils'

export async function args(b) {
  return b
    .command('info', 'View current version status, git commits, and changelog')
    .command('bump', 'Perform package version bump and release automation', bump => {
      bump
        .positional('<type>', 'Bump type: major, minor, patch, or specific semver version')
        .option('-a, --added <value>', 'Feature(s) added (repeatable option)')
        .option('-f, --fixed <value>', 'Bug(s) fixed (repeatable option)')
        .option('-c, --changed <value>', 'Improvement(s)/change(s) made (repeatable option)')
        .option('-d, --date', 'Changelog release date override (YYYY-MM-DD, defaults to today)', '')
    })
    .command('git', 'Automatically stage, commit, and tag the current version in Git')
}

export async function run(args) {
  const command = args.$command || 'info'

  if (command === 'info') {
    return runInfo()
  } else if (command === 'bump') {
    return runBump(args)
  } else if (command === 'git') {
    return runGit()
  } else {
    throw new Error(`⚠ Unknown command: "${command}"`)
  }
}

async function runInfo() {
  const version     = await json.readPath('package.json', '$.version', 'unknown')
  const lockVersion = await json.readPath('package-lock.json', '$.version', 'unknown')
  const name        = await json.readPath('package.json', '$.name', '')

  const programSrc = await fs.read('src/cli/program.js', { throw: false }) ?? ''
  const cliVersionMatch = programSrc.match(/\.version\(['"]([^'"]+)['"]/)
  const cliVersion = cliVersionMatch ? cliVersionMatch[1] : 'unknown'

  const { stdout: gitLog } = await shell.exec('git log --oneline -10 --no-decorate', { throw: false, trim: true })
  const { stdout: branch } = await shell.exec('git rev-parse --abbrev-ref HEAD', { throw: false, trim: true })
  const { stdout: lastTag } = await shell.exec('git describe --tags --abbrev=0', { throw: false, trim: true })
  const { stdout: unpushed } = await shell.exec('git rev-list --count @{u}..HEAD', { throw: false, trim: true })

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

  if (recent) {
    sections.push(section.create('changelog', {
      type: 'markdown',
      content: recent,
    }, { title: 'Recent Changelog' }))
  }

  sections.push(section.create('process', {
    type: 'markdown',
    content: md.ol([
      `Run ${md.code('crunes run release bump <type>')} where type is major, minor, or patch`,
      'Publish CI fires on the tag automatically when pushed',
    ]),
  }, { title: 'Release Process' }))

  return sections
}

async function runBump(args) {
  const type = args.type
  if (!type) {
    throw new Error('⚠ Missing required positional argument: <type> (major, minor, patch, or explicit version)')
  }

  const currentVersion = await json.readPath('package.json', '$.version', '')
  if (!currentVersion) {
    throw new Error('⚠ Could not read current version from package.json')
  }

  // 1. Calculate target version
  let targetVersion = type
  if (['major', 'minor', 'patch'].includes(type)) {
    const parts = currentVersion.split('.').map(Number)
    if (parts.length !== 3 || parts.some(isNaN)) {
      throw new Error(`⚠ Invalid semver in package.json: "${currentVersion}"`)
    }

    if (type === 'major') {
      parts[0] += 1
      parts[1] = 0
      parts[2] = 0
    } else if (type === 'minor') {
      parts[1] += 1
      parts[2] = 0
    } else if (type === 'patch') {
      parts[2] += 1
    }
    targetVersion = parts.join('.')
  }

  // Validate calculated target version syntax
  if (!/^\d+\.\d+\.\d+$/.test(targetVersion)) {
    throw new Error(`⚠ Target version "${targetVersion}" is not a valid semantic version string.`)
  }

  // 2. Resolve Changelog
  const dateOverride = args.date || args.d || ''
  const releaseDate = dateOverride || new Date().toISOString().split('T')[0]
  const changelogText = await fs.read('CHANGELOG.md', { throw: false }) ?? ''

  const versionHeader = `## [${targetVersion}]`
  const changelogExists = changelogText.includes(versionHeader)

  if (changelogExists) {
    console.log(`ℹ Pre-existing changelog section found for "${targetVersion}". Preserving existing logs.`)
  } else {
    // Normalise repeatable options to arrays
    const getList = (val) => {
      if (!val) return []
      if (Array.isArray(val)) return val
      return [val]
    }

    const addedItems   = getList(args.added || args.a)
    const fixedItems   = getList(args.fixed || args.f)
    const changedItems = getList(args.changed || args.c)

    if (addedItems.length === 0 && fixedItems.length === 0 && changedItems.length === 0) {
      throw new Error(`⚠ Target version "${targetVersion}" is not declared in CHANGELOG.md. Please write your changelog entries first or provide quick messages using the -a/--added, -f/--fixed, or -c/--changed flags.`)
    }

    const entryLines = [`## [${targetVersion}] - ${releaseDate}`, '']

    if (addedItems.length > 0) {
      entryLines.push('### Added')
      addedItems.forEach(item => entryLines.push(`- ${item}`))
      entryLines.push('')
    }
    if (changedItems.length > 0) {
      entryLines.push('### Changed')
      changedItems.forEach(item => entryLines.push(`- ${item}`))
      entryLines.push('')
    }
    if (fixedItems.length > 0) {
      entryLines.push('### Fixed')
      fixedItems.forEach(item => entryLines.push(`- ${item}`))
      entryLines.push('')
    }

    entryLines.push('---', '')
    const newEntry = entryLines.join('\n')

    const marker = '## ['
    const firstHeaderIdx = changelogText.indexOf(marker)
    let updatedChangelog = ''

    if (firstHeaderIdx === -1) {
      updatedChangelog = changelogText + '\n\n' + newEntry
    } else {
      updatedChangelog = 
        changelogText.substring(0, firstHeaderIdx) +
        newEntry +
        '\n' +
        changelogText.substring(firstHeaderIdx)
    }

    await fs.write('CHANGELOG.md', updatedChangelog)
    console.log(`✓ Automatically appended structured changelog entry under "${targetVersion}" (${releaseDate}).`)
  }

  // 3. Write package version syncs
  const packageJson = await json.read('package.json')
  packageJson.version = targetVersion
  await json.write('package.json', packageJson)
  console.log(`✓ Updated package.json version to "${targetVersion}".`)

  let programJs = await fs.read('src/cli/program.js')
  const versionRegex = /(\.version\(['"])([^'"]+)(['"])/
  if (!versionRegex.test(programJs)) {
    throw new Error('⚠ Could not locate .version() string in src/cli/program.js')
  }
  programJs = programJs.replace(versionRegex, `$1${targetVersion}$3`)
  await fs.write('src/cli/program.js', programJs)
  console.log(`✓ Updated src/cli/program.js Commander version to "${targetVersion}".`)

  // 4. NPM compile & sync
  console.log('⚡ Synchronizing package-lock.json (running npm install)...')
  await shell.exec('npm install')

  console.log('⚡ Compiling esbuild bundle (running npm run build)...')
  await shell.exec('npm run build')

  console.log('🎉 Successfully bumped version files and synced lockfile/bundles!')
  return section.create('bump-status', {
    type: 'markdown',
    content: `🎉 **Successfully bumped version files and synced lockfile/bundles!**\n\nTo commit and tag automatically, run:\n${md.code('crunes run release git')}\n\nWhen ready to publish, run ${md.code('git push origin main --tags')}.`
  }, { title: 'Version Bumped' })
}

async function runGit() {
  const targetVersion = await json.readPath('package.json', '$.version', '')
  if (!targetVersion) {
    throw new Error('⚠ Could not read version from package.json')
  }

  console.log('⚡ Staging release files in Git...')
  await shell.exec('git add package.json')
  await shell.exec('git add package-lock.json')
  await shell.exec('git add CHANGELOG.md')
  await shell.exec('git add src/cli/program.js')

  console.log(`⚡ Creating git commit "chore: release v${targetVersion}"...`)
  await shell.exec(`git commit -m "chore: release v${targetVersion}"`)

  console.log(`⚡ Creating git tag "v${targetVersion}"...`)
  await shell.exec(`git tag v${targetVersion}`)

  console.log(`🎉 Successfully automated release commit and tag for v${targetVersion}!`)
  return section.create('git-status', {
    type: 'markdown',
    content: `🎉 **Successfully committed and tagged v${targetVersion}!**\n\nRun ${md.code('git push origin main --tags')} when you are ready to publish.`
  }, { title: 'Git Complete' })
}
