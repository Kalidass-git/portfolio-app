// Runs the Gradle wrapper in android/ on Windows, Mac or Linux:  node scripts/gradle.mjs assembleDebug
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'android');
const win = process.platform === 'win32';
const args = process.argv.slice(2);
if (!args.length) { console.error('Say what to build, for example: assembleDebug'); process.exit(1); }
if (!existsSync(join(dir, win ? 'gradlew.bat' : 'gradlew'))) { console.error('The Gradle wrapper is missing in android/.'); process.exit(1); }
const r = spawnSync(win ? 'gradlew.bat' : './gradlew', args, { cwd: dir, stdio: 'inherit', shell: win });
if (r.status === 0) {
  const kind = args.some((a) => /release/i.test(a)) ? 'release' : 'debug';
  console.log(`\nDone. Your APK is in android/app/build/outputs/apk/${kind}/`);
}
process.exit(r.status ?? 1);
