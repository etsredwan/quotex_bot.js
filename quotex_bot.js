const puppeteer = require('puppeteer');
const { Telegraf, Markup } = require('telegraf');
const ti = require('technicalindicators');
require('dotenv').config();

// আপনার টেলিগ্রাম বট টোকেন ও চ্যাট আইডি
const bot = new Telegraf('7976607031:AAEheu1tqe1gxJne51Y2kvBMMGBa3Rbd5oQ');
const chatId = '6052718316';

// Quotex-এর ট্রেড পেজ (প্রয়োজন অনুযায়ী URL পরিবর্তন করুন)
const QUOTEX_URL = 'https://quotex.io/en/trade';

let selectedMarket = null;
let browser = null;
let candleInterval = null;

// Puppeteer ব্রাউজার ইনিশিয়ালাইজেশন
async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({ headless: true });
  }
  return browser;
}

// মার্কেট লিস্ট সংগ্রহ – এখানে DOM থেকে মার্কেটের নাম নিয়ে আসার চেষ্টা করা হয়েছে
async function fetchMarkets() {
  const browser = await initBrowser();
  const page = await browser.newPage();
  await page.goto(QUOTEX_URL, { waitUntil: 'networkidle2' });
  
  let markets = await page.evaluate(() => {
    // উদাহরণ: ধরে নিচ্ছি মার্কেটের নামগুলো "market-name" ক্লাসের মধ্যে আছে
    let elems = Array.from(document.querySelectorAll('.market-name'));
    return elems.map(el => el.innerText.trim());
  });
  
  await page.close();
  
  if (markets.length === 0) {
    markets = ["Market 1", "Market 2", "Market 3"];
  }
  return markets;
}

// বাছাইকৃত মার্কেটের জন্য ক্যান্ডেল সাইকেল শুরু করার ফাংশন
function startCandleAnalysis(market) {
  selectedMarket = market;
  bot.telegram.sendMessage(chatId, `✅ ${market} মার্কেটের জন্য এনালাইসিস শুরু করা হলো!`);

  // ধরে নিচ্ছি প্রতিটি ক্যান্ডেল ৬০ সেকেন্ডের  
  const candleDuration = 60 * 1000; // 60 সেকেন্ড (মিলিসেকেন্ডে)

  // প্রতিটি ক্যান্ডেল সাইকেলের জন্য ফাংশন (রিকার্সিভলি চলবে)
  async function analyzeCandleCycle() {
    const cycleStart = Date.now();

    // ক্যান্ডেল শেষ হওয়ার ২ সেকেন্ড আগে সিগন্যাল জেনারেট করার জন্য
    const waitTime = candleDuration - 2000;
    setTimeout(async () => {
      const signal = await generateTradeSignalForMarket(market);
      if (signal) {
        bot.telegram.sendMessage(chatId, `🚦 ${market} এর সিগন্যাল: ${signal}`);
      } else {
        bot.telegram.sendMessage(chatId, `⚠️ ${market} এর এই চক্রে কোনো সিগন্যাল নেই.`);
      }
    }, waitTime);

    // পুরো ক্যান্ডেল সাইকেল শেষে পুনরায় চালু হবে পরবর্তী চক্রের জন্য
    setTimeout(() => {
      analyzeCandleCycle();
    }, candleDuration);
  }

  // প্রথম ক্যান্ডেল সাইকেল শুরু
  analyzeCandleCycle();
}

// নির্বাচিত মার্কেটের জন্য ট্রেডিং সিগন্যাল জেনারেটের ফাংশন
async function generateTradeSignalForMarket(market) {
  // এখানে Puppeteer ব্যবহার করে মার্কেটের লাইভ ক্যান্ডেল ডাটা সংগ্রহ করা হবে  
  if (!browser) {
    browser = await puppeteer.launch({ headless: true });
  }
  const page = await browser.newPage();

  // ধরুন একই পেজেই মার্কেটের তথ্য রয়েছে, অথবা মার্কেট অনুযায়ী কোনো ফিল্টার প্রয়োগ করুন  
  await page.goto(QUOTEX_URL, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(1000); // একটু অপেক্ষা

  // এখানে সঠিক DOM সিলেক্টরের মাধ্যমে candle data সংগ্রহ করুন  
  let candleData = await page.evaluate((market) => {
    // উদাহরণস্বরূপ: মার্কেট অনুযায়ী কোনো element থেকে ক্যান্ডেল রঙ বা মান সংগ্রহ করা
    // এখানে আমরা র‍্যান্ডমভাবে 'green' বা 'red' নির্বাচন করছি
    const colors = ['green', 'red'];
    const randomIndex = Math.floor(Math.random() * colors.length);
    return { color: colors[randomIndex] };
  }, market);

  await page.close();

  // সিগন্যাল জেনারেশনের উদাহরণ লজিক
  if (candleData.color === 'green') {
    return "BUY (Call Option)";
  } else if (candleData.color === 'red') {
    return "SELL (Put Option)";
  }
  return null;
}

// Bot start কমান্ড
bot.start(async (ctx) => {
  ctx.reply('📡 Quotex Signal Bot-এ আপনাকে স্বাগতম!\nমার্কেটগুলো লোড করা হচ্ছে...');
  let markets = await fetchMarkets();

  // প্রতিটি মার্কেটের জন্য ইনলাইন বাটন তৈরি করা হচ্ছে (২ টি করে কলামে)
  const buttons = markets.map((market) => Markup.button.callback(market, `select_${market}`));
  await ctx.reply('একটি মার্কেট নির্বাচন করুন:', Markup.inlineKeyboard(buttons, { columns: 2 }));
});

// ইনলাইন বাটনের ক্লিক হ্যান্ডলার
bot.action(/select_(.+)/, async (ctx) => {
  const market = ctx.match[1];
  ctx.answerCbQuery(`আপনি ${market} নির্বাচন করেছেন`);
  startCandleAnalysis(market);
});

// বট লঞ্চ করা
bot.launch();
console.log('Bot started and running...');

// প্রসেস শেষ হলে ব্রাউজার বন্ধ করার হ্যান্ডলার
process.once('SIGINT', async () => {
  await bot.stop('SIGINT');
  if (browser) await browser.close();
});
process.once('SIGTERM', async () => {
  await bot.stop('SIGTERM');
  if (browser) await browser.close();
});
