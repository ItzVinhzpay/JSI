const http = require('http');
const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder, 
  ChannelType, 
  PermissionFlagsBits,
  MessageFlags
} = require('discord.js');

// ==================== 1. KEEP-ALIVE SERVER (24/7) ====================
http.createServer((req, res) => {
  res.write("🤖 Bot Discord Minigame 24/7 đang chạy online!");
  res.end();
}).listen(process.env.PORT || 8080, () => {
  console.log('🌐 Web Server Keep-Alive đã khởi chạy 24/7!');
});

// ==================== 2. CẤU HÌNH BOT ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const TOKEN = process.env.TOKEN || 'MTU1NjYxMzM0NTgxNjA4ODU5Ng.GgpRHJ.Pn27pfZuWWAgCO0AlgbTjZctHDm3Efe_6MqCNc';
const ADMIN_ROLE_ID = '1516608784393310332'; 
const SELLER_ROLE_ID = '1316277525999255592'; 

// ==================== HÀM QUY ĐỔI TIỀN (1m -> 1,000,000 / 500k -> 500,000) ====================
function parseMoneyInput(inputStr) {
  if (!inputStr) return NaN;
  let str = inputStr.trim().toLowerCase().replace(/,/g, '.');

  let multiplier = 1;
  if (str.endsWith('m')) {
    multiplier = 1000000;
    str = str.slice(0, -1);
  } else if (str.endsWith('k')) {
    multiplier = 1000;
    str = str.slice(0, -1);
  }

  const val = parseFloat(str);
  if (isNaN(val)) return NaN;
  return Math.floor(val * multiplier);
}

// ==================== 3. DỮ LIỆU GAME ====================
const userBalances = new Map();
const historyLogs = [];

let gameState = {
  dogBets: new Map(),
  catBets: new Map(),
  timeLeft: 60,
  gameMessage: null,
  timerInterval: null,
  isWaitingResult: false
};

function getBalance(userId) {
  if (!userBalances.has(userId)) {
    userBalances.set(userId, 10000000); // Tặng 10M cược thử
  }
  return userBalances.get(userId);
}

function renderGameEmbed(statusText, dogPot, catPot, dogCount, catCount, isWaiting = false) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN');
  const dateStr = now.toLocaleDateString('vi-VN');

  return new EmbedBuilder()
    .setTitle('🎲 CHÓ HAY MÈO ?')
    .setDescription(
      `${statusText}\n\n` +
      `**Chọn cửa yêu thích và đặt Gambling trước khi phiên kết thúc.**\n\n` +
      `💵 **Giới hạn:** \`500k\` - \`100m\` Gambling (Có thể gõ \`1m\`, \`5m\`, \`500k\`)\n` +
      `💰 **Tổng cược:** \`${(dogPot + catPot).toLocaleString('vi-VN')}\` Gambling\n\n` +
      `🐶 **CỬA CHÓ**\t\t\t\t\t🐱 **CỬA MÈO**\n` +
      `💰 \`${dogPot.toLocaleString('vi-VN')}\`\t\t\t\t\t💰 \`${catPot.toLocaleString('vi-VN')}\`\n` +
      `👤 \`${dogCount}\` người\t\t\t\t\t👤 \`${catCount}\` người\n\n` +
      `*Chó/Mèo x1.9*\n\n` +
      `Đang mở • ${timeStr}${dateStr}`
    )
    .setColor(isWaiting ? 0xE74C3C : 0x3498DB);
}

function renderGameButtons(disabled = false) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bet_dog').setLabel('Chó').setEmoji('🐶').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bet_cat').setLabel('Mèo').setEmoji('🐱').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('check_balance').setLabel('Số Dư').setEmoji('🔢').setStyle(ButtonStyle.Primary).setDisabled(disabled)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('view_history').setLabel('LỊCH SỬ').setEmoji('📈').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('view_leaderboard').setLabel('BXH').setEmoji('🏆').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  );

  return [row1, row2];
}

// VÒNG LẶP MINIGAME TỰ ĐỘNG 24/24
function startGameLoop() {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);

  gameState.timeLeft = 60;
  gameState.isWaitingResult = false;
  gameState.dogBets.clear();
  gameState.catBets.clear();

  gameState.timerInterval = setInterval(async () => {
    gameState.timeLeft--;

    let dogPot = 0; gameState.dogBets.forEach(v => dogPot += v);
    let catPot = 0; gameState.catBets.forEach(v => catPot += v);

    if (gameState.timeLeft > 0) {
      if (gameState.gameMessage && (gameState.timeLeft % 3 === 0 || gameState.timeLeft <= 5)) {
        try {
          await gameState.gameMessage.edit({
            embeds: [renderGameEmbed(`⏳ **Thời gian còn lại:** \`${gameState.timeLeft}s\``, dogPot, catPot, gameState.dogBets.size, gameState.catBets.size, false)],
            components: renderGameButtons(false)
          });
        } catch (e) {}
      }
    }

    if (gameState.timeLeft === 0) {
      clearInterval(gameState.timerInterval);
      gameState.isWaitingResult = true;

      let waitTimeLeft = 5;

      try {
        if (gameState.gameMessage) {
          await gameState.gameMessage.edit({
            embeds: [renderGameEmbed(`🔒 **ĐÃ KHÓA CƯỢC!** ⏳ **Đang chờ công bố kết quả sau ${waitTimeLeft}s...**`, dogPot, catPot, gameState.dogBets.size, gameState.catBets.size, true)],
            components: renderGameButtons(true)
          });
        }
      } catch (e) {}

      const waitInterval = setInterval(async () => {
        waitTimeLeft--;
        if (waitTimeLeft > 0) {
          try {
            if (gameState.gameMessage) {
              await gameState.gameMessage.edit({
                embeds: [renderGameEmbed(`🔒 **ĐÃ KHÓA CƯỢC!** ⏳ **Đang chờ công bố kết quả sau ${waitTimeLeft}s...**`, dogPot, catPot, gameState.dogBets.size, gameState.catBets.size, true)],
                components: renderGameButtons(true)
              });
            }
          } catch (e) {}
        } else {
          clearInterval(waitInterval);

          const winningSide = Math.random() < 0.5 ? 'DOG' : 'CAT';
          const winnerEmoji = winningSide === 'DOG' ? '🐶 CHÓ' : '🐱 MÈO';
          const nowStr = new Date().toLocaleTimeString('vi-VN');

          let resultText = `🎉 **KẾT QUẢ VÁN VỪA RỒI:** Cửa **${winnerEmoji}** thắng!\n\n`;

          const winners = winningSide === 'DOG' ? gameState.dogBets : gameState.catBets;
          const losers = winningSide === 'DOG' ? gameState.catBets : gameState.dogBets;

          winners.forEach((amount, userId) => {
            const winAmount = Math.floor(amount * 1.9);
            userBalances.set(userId, getBalance(userId) + winAmount);
            resultText += `🟢 <@${userId}> thắng \`+${winAmount.toLocaleString('vi-VN')}\` Gambling!\n`;
          });

          losers.forEach((amount, userId) => {
            resultText += `🔴 <@${userId}> thua \`-${amount.toLocaleString('vi-VN')}\` Gambling!\n`;
          });

          if (winners.size === 0 && losers.size === 0) {
            resultText += `*Không có ai đặt cược ở ván này.*`;
          }

          historyLogs.unshift(`[${nowStr}]${winnerEmoji} thắng`);

          if (gameState.gameMessage) {
            const currentChannel = gameState.gameMessage.channel;
            const resultMsg = await currentChannel.send(resultText);

            setTimeout(async () => {
              try { await gameState.gameMessage.delete().catch(() => {}); } catch (e) {}
              try { await resultMsg.delete().catch(() => {}); } catch (e) {}

              gameState.gameMessage = await currentChannel.send({
                embeds: [renderGameEmbed(`⏳ **Thời gian còn lại:** \`60s\``, 0, 0, 0, 0, false)],
                components: renderGameButtons(false)
              });

              startGameLoop();
            }, 10000);
          }
        }
      }, 1000);
    }
  }, 1000);
}

client.once('ready', () => {
  console.log('🤖 Bot Discord đã sẵn sàng hoạt động 24/7: ' + client.user.tag);
});

// ==================== 4. CÁC LỆNH CỦA BOT ====================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

  // LỆNH GỌI MINIGAME THỦ CÔNG (!mini-game)
  if (message.content.toLowerCase() === '!mini-game') {
    let dogPot = 0; gameState.dogBets.forEach(v => dogPot += v);
    let catPot = 0; gameState.catBets.forEach(v => catPot += v);

    gameState.gameMessage = await message.channel.send({
      embeds: [renderGameEmbed(`⏳ **Thời gian còn lại:** \`${gameState.timeLeft}s\``, dogPot, catPot, gameState.dogBets.size, gameState.catBets.size, false)],
      components: renderGameButtons(false)
    });
    return;
  }

  // 1. LỆNH XÓA TẤT CẢ KÊNH (!clear-all)
  if (message.content.toLowerCase() === '!clear-all') {
    if (!isAdmin) return message.reply('❌ **Từ chối truy cập:** Chỉ Admin mới có quyền sử dụng lệnh này!');

    await message.reply('⚠️ **CẢNH BÁO:** Đang xóa sạch toàn bộ kênh và danh mục trong server...');

    const channels = await message.guild.channels.fetch();
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);

    for (const [id, channel] of channels) {
      if (channel) {
        await channel.delete().catch(() => {});
      }
    }

    const newChan = await message.guild.channels.create({
      name: '💬┆sảnh-chờ',
      type: ChannelType.GuildText
    });

    await newChan.send('✅ **Đã xóa sạch tất cả các kênh!**\nGõ `!setup-server` để khởi tạo lại server.');
    return;
  }

  // 2. LỆNH CỘNG TIỀN (!addmoney @user <số_tiền>)
  if (message.content.startsWith('!addmoney')) {
    if (!isAdmin) return message.reply('❌ **Từ chối truy cập:** Chỉ Admin mới có quyền sử dụng lệnh này!');

    const args = message.content.split(' ');
    const target = message.mentions.users.first();
    const amount = parseMoneyInput(args[2]);

    if (!target || isNaN(amount) || amount <= 0) return message.reply('❌ Cú pháp đúng: `!addmoney @user 1m` hoặc `!addmoney @user 1000000`');

    const currentBal = getBalance(target.id);
    userBalances.set(target.id, currentBal + amount);
    return message.reply(`✅ Đã cộng \`${amount.toLocaleString('vi-VN')}\` Gambling cho <@${target.id}>. Số dư mới: \`${userBalances.get(target.id).toLocaleString('vi-VN')}\``);
  }

  // 3. LỆNH CHUYỂN TIỀN CỦA ADMIN (!pay @user <số_tiền>)
  if (message.content.startsWith('!pay')) {
    if (!isAdmin) return message.reply('❌ **Từ chối truy cập:** Chỉ Admin mới có quyền sử dụng lệnh này!');

    const args = message.content.split(' ');
    const target = message.mentions.users.first();
    const amount = parseMoneyInput(args[2]);

    if (!target || isNaN(amount) || amount <= 0) return message.reply('❌ Cú pháp đúng: `!pay @user 500k` hoặc `!pay @user 1m`');
    if (target.id === message.author.id) return message.reply('❌ Bạn không thể tự chuyển tiền cho chính mình!');

    const senderBal = getBalance(message.author.id);
    if (senderBal < amount) return message.reply('❌ Số dư trong tài khoản Admin không đủ!');

    userBalances.set(message.author.id, senderBal - amount);
    userBalances.set(target.id, getBalance(target.id) + amount);

    return message.reply(`💸 Admin <@${message.author.id}> đã chuyển \`${amount.toLocaleString('vi-VN')}\` Gambling cho <@${target.id}>!`);
  }

  // 4. LỆNH TẠO SERVER CỦA ADMIN (!setup-server)
  if (message.content.toLowerCase() === '!setup-server') {
    if (!isAdmin) return message.reply('❌ **Từ chối truy cập:** Chỉ Admin mới có quyền sử dụng lệnh này!');

    const guild = message.guild;
    await message.reply('⏳ Đang khởi tạo lại toàn bộ danh sách kênh theo mẫu...');

    // DANH MỤC 1: THÔNG BÁO & THÔNG TIN SERVER
    const cat1 = await guild.channels.create({ name: '1 ・ THÔNG ・ BÁO', type: ChannelType.GuildCategory });
    await guild.channels.create({ name: '👑┆về-chúng-tôi', type: ChannelType.GuildText, parent: cat1.id });
    await guild.channels.create({ name: '👑┆partner', type: ChannelType.GuildText, parent: cat1.id });
    await guild.channels.create({ name: '💰┆cọc', type: ChannelType.GuildText, parent: cat1.id });
    await guild.channels.create({ name: '🤝┆giao-dịch-trung-gian', type: ChannelType.GuildText, parent: cat1.id });
    await guild.channels.create({ name: '👋┆welcome', type: ChannelType.GuildText, parent: cat1.id });
    await guild.channels.create({ name: '📢┆thông-báo', type: ChannelType.GuildText, parent: cat1.id });
    await guild.channels.create({ name: '🎥┆uploads', type: ChannelType.GuildText, parent: cat1.id });
    await guild.channels.create({ name: '📜┆rules', type: ChannelType.GuildText, parent: cat1.id });
    await guild.channels.create({ name: '🚫┆scammer', type: ChannelType.GuildText, parent: cat1.id });
    await guild.channels.create({ name: '📊┆ranks', type: ChannelType.GuildText, parent: cat1.id });
    await guild.channels.create({ name: '🎁┆give-2b', type: ChannelType.GuildText, parent: cat1.id });
    await guild.channels.create({ name: '💎┆up-coc', type: ChannelType.GuildText, parent: cat1.id });

    // DANH MỤC 2: MAIN COMMUNITY
    const cat2 = await guild.channels.create({ name: '2 ・ 🌟|===== Main =====|🌟', type: ChannelType.GuildCategory });
    await guild.channels.create({ name: '💬┆giao-lưu', type: ChannelType.GuildText, parent: cat2.id });
    await guild.channels.create({ name: '🍩┆donut-stats', type: ChannelType.GuildText, parent: cat2.id });
    await guild.channels.create({ name: '👑┆king-stats', type: ChannelType.GuildText, parent: cat2.id });
    await guild.channels.create({ name: '⚡┆booster', type: ChannelType.GuildText, parent: cat2.id });
    await guild.channels.create({ name: '❓┆diễn-đàn', type: ChannelType.GuildText, parent: cat2.id });

    // DANH MỤC 3: BÁN MONEY
    const cat3 = await guild.channels.create({ name: '3 ・ 🟢| Bán Money', type: ChannelType.GuildCategory });
    await guild.channels.create({ name: '🛒┆Bán・Money・Donut', type: ChannelType.GuildText, parent: cat3.id });
    await guild.channels.create({ name: '🛒┆Bán・Money・King', type: ChannelType.GuildText, parent: cat3.id });

    // DANH MỤC 4: DỊCH VỤ KING/DONUT
    const cat4 = await guild.channels.create({ name: '4 ・ 💰 Dịch Vụ King/Donut 💰', type: ChannelType.GuildCategory });
    await guild.channels.create({ name: '👑┆SEEMINH・SELL', type: ChannelType.GuildText, parent: cat4.id });
    await guild.channels.create({ name: '🛒┆Evanderx・KingMc', type: ChannelType.GuildText, parent: cat4.id });

    // DANH MỤC 5: DỊCH VỤ BUILD
    const cat5 = await guild.channels.create({ name: '5 ・ ⚒️ DỊCH VỤ BUILD', type: ChannelType.GuildCategory });
    await guild.channels.create({ name: '👑┆sell-farm-KingMc', type: ChannelType.GuildText, parent: cat5.id });
    await guild.channels.create({ name: '🏗️┆Thuê・building・KingDo...', type: ChannelType.GuildText, parent: cat5.id });
    await guild.channels.create({ name: '👑┆giá-farm☠️', type: ChannelType.GuildText, parent: cat5.id });
    await guild.channels.create({ name: '⚒️┆buider-coc85k-vippro', type: ChannelType.GuildText, parent: cat5.id });

    // DANH MỤC 6: CHECK LEGIT
    const cat6 = await guild.channels.create({ name: '6 ・ check legit', type: ChannelType.GuildCategory });
    await guild.channels.create({ name: '💰┆Bill', type: ChannelType.GuildText, parent: cat6.id });
    await guild.channels.create({ name: '👍┆Legit', type: ChannelType.GuildText, parent: cat6.id });
    await guild.channels.create({ name: '⭐┆Phản-hồi-280', type: ChannelType.GuildText, parent: cat6.id });

    // DANH MỤC 7: SUPPORT / TICKET
    const catSupport = await guild.channels.create({ name: 'Support', type: ChannelType.GuildCategory });
    const ticketChan = await guild.channels.create({ name: '🎫┆Ticket', type: ChannelType.GuildText, parent: catSupport.id });

    const embedTicket = new EmbedBuilder()
      .setTitle('🎫 HỆ THỐNG HỖ TRỢ & MUA HÀNG')
      .setDescription('• **💵 Nạp tiền gambling:** Nạp tiền vào tài khoản chơi minigame.\n• **🛒 Liên hệ Seller:** Mua bán, trao đổi item.')
      .setColor(0x3498DB);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_ticket_type')
      .setPlaceholder('👉 Chọn loại Ticket cần hỗ trợ...')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Nạp tiền gambling').setValue('ticket_nap_tiyen').setEmoji('💵'),
        new StringSelectMenuOptionBuilder().setLabel('Liên hệ Seller / Mua hàng').setValue('ticket_seller').setEmoji('🛒')
      );

    await ticketChan.send({ embeds: [embedTicket], components: [new ActionRowBuilder().addComponents(selectMenu)] });

    // DANH MỤC 8: MINECRAFT
    const catMine = await guild.channels.create({ name: '⛏️ Minecraft', type: ChannelType.GuildCategory });
    await guild.channels.create({ name: '📁┆resource-pack', type: ChannelType.GuildText, parent: catMine.id });
    await guild.channels.create({ name: '📦┆schematics', type: ChannelType.GuildText, parent: catMine.id });
    await guild.channels.create({ name: '💻┆Client・Hack', type: ChannelType.GuildText, parent: catMine.id });
    await guild.channels.create({ name: '🔎┆Ratter・Scanner', type: ChannelType.GuildText, parent: catMine.id });

    // DANH MỤC 9: MINIGAME 24/7
    const catGame = await guild.channels.create({ name: '🎮 ・ MINIGAME 24/7', type: ChannelType.GuildCategory });
    const minigameChan = await guild.channels.create({ name: '🎮┆minigame-chó-mèo', type: ChannelType.GuildText, parent: catGame.id });

    // Khởi chạy Minigame
    gameState.gameMessage = await minigameChan.send({
      embeds: [renderGameEmbed(`⏳ **Thời gian còn lại:** \`60s\``, 0, 0, 0, 0, false)],
      components: renderGameButtons(false)
    });

    startGameLoop();
  }
});

// ==================== 5. XỬ LÝ INTERACTION ====================
client.on('interactionCreate', async (interaction) => {

  // Mở Modal Đặt Cược
  if (interaction.isButton() && (interaction.customId === 'bet_dog' || interaction.customId === 'bet_cat')) {
    if (gameState.isWaitingResult || gameState.timeLeft <= 0) {
      return interaction.reply({ content: '🔒 Đã hết thời gian cược! Vui lòng chờ công bố kết quả và bắt đầu ván mới.', flags: MessageFlags.Ephemeral });
    }

    const choice = interaction.customId === 'bet_dog' ? 'Chó 🐶' : 'Mèo 🐱';
    const modal = new ModalBuilder()
      .setCustomId(`modal_bet_${interaction.customId}`)
      .setTitle(`Đặt cược cửa ${choice}`);

    const amountInput = new TextInputBuilder()
      .setCustomId('bet_amount')
      .setLabel("Nhập số tiền (VD: 500k, 1m, 10m...)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Ví dụ: 1m hoặc 500k")
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
    await interaction.showModal(modal);
  }

  // Xử lý khi gửi số tiền đặt cược
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_bet_')) {
    if (gameState.isWaitingResult || gameState.timeLeft <= 0) {
      return interaction.reply({ content: '🔒 Ván cược đã đóng! Vui lòng chờ ván tiếp theo.', flags: MessageFlags.Ephemeral });
    }

    const isDog = interaction.customId === 'modal_bet_bet_dog';
    const amountStr = interaction.fields.getTextInputValue('bet_amount');
    const amount = parseMoneyInput(amountStr);

    if (isNaN(amount) || amount < 500000 || amount > 100000000) {
      return interaction.reply({ content: '❌ Số tiền không hợp lệ! Giới hạn cược từ 500k đến 100m Gambling.', flags: MessageFlags.Ephemeral });
    }

    const currentBal = getBalance(interaction.user.id);
    if (currentBal < amount) {
      return interaction.reply({ content: `❌ Bạn không đủ tiền! Số dư của bạn: \`${currentBal.toLocaleString('vi-VN')}\` Gambling.`, flags: MessageFlags.Ephemeral });
    }

    userBalances.set(interaction.user.id, currentBal - amount);

    if (isDog) {
      gameState.dogBets.set(interaction.user.id, (gameState.dogBets.get(interaction.user.id) || 0) + amount);
    } else {
      gameState.catBets.set(interaction.user.id, (gameState.catBets.get(interaction.user.id) || 0) + amount);
    }

    await interaction.reply({
      content: `✅ Đã cược thành công \`${amount.toLocaleString('vi-VN')}\` Gambling vào cửa **${isDog ? 'Chó 🐶' : 'Mèo 🐱'}**!\n💰 Số dư còn lại: \`${userBalances.get(interaction.user.id).toLocaleString('vi-VN')}\``,
      flags: MessageFlags.Ephemeral
    });
  }

  // Xem Số Dư
  if (interaction.isButton() && interaction.customId === 'check_balance') {
    await interaction.reply({
      content: `💳 **SỐ DƯ CỦA BẠN:** \`${getBalance(interaction.user.id).toLocaleString('vi-VN')}\` Gambling`,
      flags: MessageFlags.Ephemeral
    });
  }

  // Xem Lịch Sử
  if (interaction.isButton() && interaction.customId === 'view_history') {
    const logs = historyLogs.slice(0, 5).join('\n') || 'Chưa có lịch sử phiên cược nào.';
    await interaction.reply({ content: `📈 **LỊCH SỬ CÁC PHIÊN TRƯỚC:**\n${logs}`, flags: MessageFlags.Ephemeral });
  }

  // Xem BXH Top 5
  if (interaction.isButton() && interaction.customId === 'view_leaderboard') {
    const sorted = [...userBalances.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    let leaderboardText = '🏆 **TOP 5 ĐẠI GIA GAMBLING:**\n\n';
    if (sorted.length === 0) {
      leaderboardText += 'Chưa có dữ liệu người chơi.';
    } else {
      sorted.forEach(([userId, balance], index) => {
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        leaderboardText += `${medals[index]} <@${userId}>: \`${balance.toLocaleString('vi-VN')}\` Gambling\n`;
      });
    }
    await interaction.reply({ content: leaderboardText, flags: MessageFlags.Ephemeral });
  }

  // Xử lý Ticket Support
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_type') {
    const { guild, member, values } = interaction;
    const isSeller = values[0] === 'ticket_seller';
    const isNapTien = values[0] === 'ticket_nap_tiyen';

    let prefix = 'support-';
    if (isSeller) prefix = 'seller-';
    if (isNapTien) prefix = 'nap-tiien-';

    const channelName = prefix + member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (guild.channels.cache.find(c => c.name === channelName)) {
      return interaction.reply({ content: '❌ Bạn đã có ticket đang mở!', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const permissionOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
    ];

    if (ADMIN_ROLE_ID && ADMIN_ROLE_ID.length > 5) {
      permissionOverwrites.push({ id: ADMIN_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }

    if (isSeller && SELLER_ROLE_ID && SELLER_ROLE_ID.length > 5) {
      permissionOverwrites.push({ id: SELLER_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }

    const supportCat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('support'));
    const ticketChan = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: supportCat ? supportCat.id : null, permissionOverwrites });

    const titleText = isNapTien ? '💵 Ticket Nạp Tiền Gambling' : '🎫 Ticket Support';
    const descText = isNapTien ? 'Vui lòng nhập số tiền bạn muốn nạp và gửi hóa đơn/bill giao dịch để Admin hỗ trợ cộng tiền.' : 'Vui lòng nhập nội dung cần hỗ trợ.';

    await ticketChan.send({
      content: `<@${member.id}> ${isSeller ? `<@&${SELLER_ROLE_ID}>` : ''}`,
      embeds: [new EmbedBuilder().setTitle(titleText).setDescription(descText).setColor(0x2ECC71)],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Đóng Ticket').setStyle(ButtonStyle.Danger))]
    });

    await interaction.editReply({ content: '✅ Đã tạo ticket tại ' + ticketChan });
  }

  // Đóng ticket
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    await interaction.reply('🔒 Ticket sẽ bị xóa sau 5 giây...');
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }
});

// ==================== 6. ĐĂNG NHẬP BOT ====================
client.login(TOKEN);