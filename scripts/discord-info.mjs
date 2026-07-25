/**
 * In thong tin bot + LINK INVITE dung san. KHONG in token.
 *   npm run invite      (hoac: node --env-file=.env scripts/discord-info.mjs)
 */
import { fetchDiscordInfo } from '../src/discordInfo.mjs';

const token = (process.env.DISCORD_TOKEN || '').trim();
if (!token) {
  console.error('❌ DISCORD_TOKEN trong — chay: bash scripts/setup-env.sh');
  process.exit(1);
}

try {
  const info = await fetchDiscordInfo(token);

  console.log('\n=== Bot ===');
  console.log(`  ten:            ${info.bot.tag}`);
  console.log(`  bot user id:    ${info.bot.id}`);

  console.log('\n=== Application ===');
  console.log(`  ten app:        ${info.app.name}`);
  console.log(`  application id: ${info.app.id}`);
  console.log(`  public bot:     ${info.app.publicBot ? 'CO (ai cung moi duoc)' : 'khong (chi ban moi duoc)'}`);
  console.log(
    `  MESSAGE CONTENT INTENT: ${
      info.app.messageContentIntent ? '✅ DA BAT' : '❌ CHUA BAT — bot se KHONG doc duoc noi dung cau hoi'
    }`
  );
  if (!info.app.messageContentIntent) {
    console.log('     → Developer Portal → app nay → Bot → Privileged Gateway Intents');
    console.log('       → bat MESSAGE CONTENT INTENT → Save Changes');
  }

  console.log('\n=== Server bot dang o ===');
  if (!info.guilds.length) console.log('  (chua o server nao — dung link invite duoi day)');
  else for (const g of info.guilds) console.log(`  • ${g.name}  (id ${g.id})`);

  console.log('\n=== LINK INVITE (mo link, chon server, bam Authorize) ===');
  console.log(`\n${info.inviteUrl}\n`);
  console.log('  Quyen xin: View Channels + Send Messages + Read Message History + Send Messages in Threads');
  console.log('  (khong xin quyen admin, khong xin quyen kick/ban/quan ly server)\n');
} catch (err) {
  console.error(`\n❌ ${err.message}`);
  if (err.status === 401) {
    console.error('   → DISCORD_TOKEN sai hoac da bi reset.');
    console.error('     Bot token o: Developer Portal → app → tab Bot → Reset Token (KHONG phai Client Secret).');
    console.error('     Roi chay: bash scripts/setup-env.sh');
  }
  process.exit(1);
}
